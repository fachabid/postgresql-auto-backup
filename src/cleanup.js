'use strict';

const fs = require('fs/promises');
const path = require('path');
const { parseBackupName } = require('./filenames');
const { TMP_SUFFIX } = require('./backup');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Supprime les sauvegardes expirées (mtime > RETENTION_DAYS), sauf les
 * MIN_BACKUPS_KEPT plus récentes de chaque base/instance : si les sauvegardes
 * cessent de fonctionner, la rétention ne vide jamais le répertoire.
 * Les fichiers qui ne suivent pas le format `{stem}_{horodatage}.sql.gz` sont ignorés.
 */
async function cleanupOldBackups(config, logger) {
  const now = Date.now();
  const cutoff = now - config.retentionDays * MS_PER_DAY;
  const minKept = config.minBackupsKept ?? 3;
  let deleted = 0;
  let kept = 0;

  logger.info('Démarrage du nettoyage', {
    backupDir: config.backupDir,
    retentionDays: config.retentionDays,
    minBackupsKept: minKept,
    dryRun: config.dryRun,
  });

  let entries;
  try {
    entries = await fs.readdir(config.backupDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn('Répertoire de sauvegarde absent, rien à nettoyer', {
        backupDir: config.backupDir,
      });
      return { deleted: 0, kept: 0 };
    }
    throw err;
  }

  async function remove(name, ageDays, reason) {
    if (config.dryRun) {
      logger.info('[DRY-RUN] Fichier à supprimer', { file: name, ageDays, reason });
    } else {
      await fs.unlink(path.join(config.backupDir, name));
      logger.info('Fichier supprimé', { file: name, ageDays, reason });
    }
    deleted += 1;
  }

  const groups = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.stat(path.join(config.backupDir, entry.name));
    const ageDays = Math.floor((now - stats.mtimeMs) / MS_PER_DAY);

    // Résidu d'une sauvegarde interrompue (crash, kill) : supprimé après 1 jour.
    if (entry.name.endsWith(`.sql.gz${TMP_SUFFIX}`)) {
      if (now - stats.mtimeMs > MS_PER_DAY) {
        await remove(entry.name, ageDays, 'fichier temporaire abandonné');
      }
      continue;
    }

    const parsed = parseBackupName(entry.name);
    if (!parsed) {
      continue;
    }

    if (!groups.has(parsed.stem)) {
      groups.set(parsed.stem, []);
    }
    groups.get(parsed.stem).push({
      name: entry.name,
      timestamp: parsed.timestamp,
      mtimeMs: stats.mtimeMs,
      ageDays,
    });
  }

  for (const files of groups.values()) {
    files.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    files.forEach((file, index) => {
      file.protected = index < minKept;
    });

    for (const file of files) {
      if (file.mtimeMs < cutoff && !file.protected) {
        await remove(file.name, file.ageDays, 'rétention dépassée');
      } else {
        kept += 1;
      }
    }
  }

  logger.info('Nettoyage terminé', { deleted, kept });
  return { deleted, kept };
}

module.exports = { cleanupOldBackups };
