'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');
const { formatTimestamp } = require('./logger');
const { EXIT } = require('./config');

const TMP_SUFFIX = '.tmp';

function buildPgEnv(instance) {
  const env = {
    ...process.env,
    PGHOST: instance.host,
    PGPORT: instance.port,
    PGUSER: instance.user,
  };

  if (instance.password) {
    env.PGPASSWORD = instance.password;
  }

  if (instance.passfile) {
    env.PGPASSFILE = instance.passfile;
  }

  return env;
}

/**
 * Exécute une commande de dump et écrit sa sortie compressée.
 * Le fichier est écrit sous un nom temporaire (.tmp, mode 0600) puis renommé
 * seulement si la commande a réussi : un fichier final est donc toujours complet.
 */
async function dumpToGzipFile({ command, args, outputPath, instance, config, logger, label }) {
  if (config.dryRun) {
    logger.info('[DRY-RUN] Sauvegarde simulée', {
      instance: instance.id,
      command,
      args,
      outputPath,
      label,
    });
    return { outputPath, dryRun: true };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const tmpPath = `${outputPath}${TMP_SUFFIX}`;
  const child = spawn(command, args, {
    env: buildPgEnv(instance),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const gzip = createGzip();
  const output = fs.createWriteStream(tmpPath, { mode: 0o600 });
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const closePromise = new Promise((resolve, reject) => {
    child.on('error', (err) => {
      reject(new Error(`Impossible de lancer ${command} : ${err.message}`));
    });
    child.on('close', resolve);
  });

  try {
    const [, exitCode] = await Promise.all([
      pipeline(child.stdout, gzip, output),
      closePromise,
    ]);

    if (exitCode !== 0) {
      const detail = stderr.trim() || `code de sortie ${exitCode}`;
      throw new Error(`${command} a échoué (${instance.id}) : ${detail}`);
    }

    fs.renameSync(tmpPath, outputPath);
  } catch (err) {
    output.destroy();
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  const stats = fs.statSync(outputPath);
  logger.info('Sauvegarde créée', {
    instance: instance.id,
    label,
    outputPath,
    sizeBytes: stats.size,
  });

  return { outputPath, sizeBytes: stats.size, dryRun: false };
}

async function backupDatabase(instance, database, config, logger, timestamp) {
  const filename = `${instance.id}_${database}_${timestamp}.sql.gz`;

  return dumpToGzipFile({
    command: instance.bin.pgDump,
    args: ['--no-owner', '--no-acl', '-d', database],
    outputPath: path.join(config.backupDir, filename),
    instance,
    config,
    logger,
    label: database,
  });
}

async function backupRoles(instance, config, logger, timestamp) {
  const filename = `${instance.id}_roles_${timestamp}.sql.gz`;

  return dumpToGzipFile({
    command: instance.bin.pgDumpall,
    args: ['--roles-only'],
    outputPath: path.join(config.backupDir, filename),
    instance,
    config,
    logger,
    label: 'roles',
  });
}

/**
 * Sauvegarde toutes les instances. Un échec sur une base n'interrompt pas les
 * suivantes ; les échecs sont agrégés et signalés à la fin (exit code 1).
 */
async function runBackup(config, logger) {
  const timestamp = formatTimestamp();
  const results = [];
  const failures = [];

  logger.info('Démarrage des sauvegardes', {
    instances: config.instances.map((i) => i.id),
    backupDir: config.backupDir,
    dryRun: config.dryRun,
    configSource: config.configSource,
  });

  async function attempt(instance, label, task) {
    try {
      results.push(await task());
    } catch (err) {
      failures.push({ instance: instance.id, label, error: err.message });
      logger.error(`Échec de la sauvegarde ${instance.id}/${label}`, {
        instance: instance.id,
        label,
        error: err.message,
      });
    }
  }

  for (const instance of config.instances) {
    logger.info(`Instance ${instance.id}`, {
      host: instance.host,
      port: instance.port,
      databases: instance.databases,
      backupRoles: instance.backupRoles,
    });

    for (const database of instance.databases) {
      logger.info(`Sauvegarde de la base ${database}`, { instance: instance.id });
      await attempt(instance, database, () =>
        backupDatabase(instance, database, config, logger, timestamp));
    }

    if (instance.backupRoles) {
      logger.info('Sauvegarde des rôles PostgreSQL', { instance: instance.id });
      await attempt(instance, 'roles', () =>
        backupRoles(instance, config, logger, timestamp));
    }
  }

  logger.info('Sauvegardes terminées', {
    succeeded: results.length,
    failed: failures.length,
  });

  if (failures.length > 0) {
    const error = new Error(
      `${failures.length} sauvegarde(s) en échec :\n- ${failures
        .map((f) => `${f.instance}/${f.label} : ${f.error}`)
        .join('\n- ')}`,
    );
    error.exitCode = EXIT.BACKUP_FAILED;
    error.failures = failures;
    throw error;
  }

  return results;
}

module.exports = { runBackup, buildPgEnv, TMP_SUFFIX };
