'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createGunzip } = require('zlib');
const { buildPgEnv } = require('./backup');

function isRolesBackup(filePath) {
  return path.basename(filePath).startsWith('roles_');
}

async function restoreBackup(config, logger, options) {
  const { file, database } = options;

  if (!file) {
    throw new Error('L\'option --file est obligatoire pour restore');
  }

  const resolvedFile = path.resolve(file);

  if (!fs.existsSync(resolvedFile)) {
    throw new Error(`Fichier introuvable : ${resolvedFile}`);
  }

  if (!resolvedFile.endsWith('.sql.gz')) {
    throw new Error('Seuls les fichiers .sql.gz sont supportés');
  }

  const rolesBackup = isRolesBackup(resolvedFile);

  if (!rolesBackup && !database) {
    throw new Error('L\'option --database est obligatoire pour restaurer une base');
  }

  if (rolesBackup && database) {
    logger.warn('Option --database ignorée pour un dump de rôles');
  }

  if (config.dryRun) {
    logger.info('[DRY-RUN] Restauration simulée', {
      file: resolvedFile,
      database: rolesBackup ? null : database,
      rolesBackup,
    });
    return;
  }

  logger.info('Démarrage de la restauration', {
    file: resolvedFile,
    database: rolesBackup ? null : database,
    rolesBackup,
  });

  const psqlArgs = rolesBackup
    ? ['-f', '-']
    : ['-d', database, '-f', '-'];

  const child = spawn('psql', psqlArgs, {
    env: buildPgEnv(config),
    stdio: ['pipe', 'inherit', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const closePromise = new Promise((resolve, reject) => {
    child.on('error', (err) => {
      reject(new Error(`Impossible de lancer psql : ${err.message}`));
    });
    child.on('close', resolve);
  });

  const input = fs.createReadStream(resolvedFile);
  const gunzip = createGunzip();

  try {
    const [, exitCode] = await Promise.all([
      pipeline(input, gunzip, child.stdin),
      closePromise,
    ]);

    if (exitCode !== 0) {
      const detail = stderr.trim() || `code de sortie ${exitCode}`;
      throw new Error(`Restauration échouée : ${detail}`);
    }
  } catch (err) {
    if (err.message.startsWith('Restauration échouée')) {
      throw err;
    }
    throw new Error(`Erreur lors de la restauration : ${err.message}`);
  }

  logger.info('Restauration terminée', { file: resolvedFile });
}

module.exports = { restoreBackup, isRolesBackup };
