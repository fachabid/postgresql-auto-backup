'use strict';

const fs = require('fs/promises');
const path = require('path');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function cleanupOldBackups(config, logger) {
  const cutoff = Date.now() - config.retentionDays * MS_PER_DAY;
  let deleted = 0;
  let kept = 0;

  logger.info('Démarrage du nettoyage', {
    backupDir: config.backupDir,
    retentionDays: config.retentionDays,
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

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql.gz')) {
      continue;
    }

    const filePath = path.join(config.backupDir, entry.name);
    const stats = await fs.stat(filePath);
    const ageDays = Math.floor((Date.now() - stats.mtimeMs) / MS_PER_DAY);

    if (stats.mtimeMs < cutoff) {
      if (config.dryRun) {
        logger.info('[DRY-RUN] Fichier à supprimer', {
          file: entry.name,
          ageDays,
        });
      } else {
        await fs.unlink(filePath);
        logger.info('Fichier supprimé', { file: entry.name, ageDays });
      }
      deleted += 1;
    } else {
      kept += 1;
    }
  }

  logger.info('Nettoyage terminé', { deleted, kept });
  return { deleted, kept };
}

module.exports = { cleanupOldBackups };
