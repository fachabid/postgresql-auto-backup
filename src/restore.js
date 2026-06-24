'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createGunzip } = require('zlib');
const { buildPgEnv } = require('./backup');
const { findInstanceById, resolveInstanceFromFilename } = require('./config');

function isRolesBackup(filePath, instanceId = null) {
  const basename = path.basename(filePath, '.sql.gz');

  if (basename === 'roles') {
    return true;
  }

  if (instanceId) {
    return basename === `${instanceId}_roles`;
  }

  return basename.endsWith('_roles');
}

function resolveInstance(config, options) {
  if (options.instance) {
    const instance = findInstanceById(config, options.instance);
    if (!instance) {
      throw new Error(`Instance inconnue : ${options.instance}`);
    }
    return instance;
  }

  if (options.file) {
    const fromFile = resolveInstanceFromFilename(config, options.file);
    if (fromFile) {
      return fromFile;
    }
  }

  const defaultInstance = findInstanceById(config, 'default');
  if (defaultInstance) {
    return defaultInstance;
  }

  if (config.instances.length === 1) {
    return config.instances[0];
  }

  throw new Error(
    'Impossible de déterminer l\'instance : précisez --instance <id>',
  );
}

async function restoreBackup(config, logger, options) {
  const { file, database } = options;
  const instance = resolveInstance(config, options);

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

  const rolesBackup = isRolesBackup(resolvedFile, instance.id);

  if (!rolesBackup && !database) {
    throw new Error('L\'option --database est obligatoire pour restaurer une base');
  }

  if (rolesBackup && database) {
    logger.warn('Option --database ignorée pour un dump de rôles');
  }

  if (config.dryRun) {
    logger.info('[DRY-RUN] Restauration simulée', {
      instance: instance.id,
      file: resolvedFile,
      database: rolesBackup ? null : database,
      rolesBackup,
      psql: instance.bin.psql,
    });
    return;
  }

  logger.info('Démarrage de la restauration', {
    instance: instance.id,
    host: instance.host,
    port: instance.port,
    file: resolvedFile,
    database: rolesBackup ? null : database,
    rolesBackup,
  });

  const psqlArgs = rolesBackup
    ? ['-f', '-']
    : ['-d', database, '-f', '-'];

  const child = spawn(instance.bin.psql, psqlArgs, {
    env: buildPgEnv(instance),
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
      throw new Error(`Restauration échouée (${instance.id}) : ${detail}`);
    }
  } catch (err) {
    if (err.message.startsWith('Restauration échouée')) {
      throw err;
    }
    throw new Error(`Erreur lors de la restauration : ${err.message}`);
  }

  logger.info('Restauration terminée', { instance: instance.id, file: resolvedFile });
}

module.exports = { restoreBackup, isRolesBackup, resolveInstance };
