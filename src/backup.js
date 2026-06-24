'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');
const { formatTimestamp } = require('./logger');

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

  const child = spawn(command, args, {
    env: buildPgEnv(instance),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const gzip = createGzip();
  const output = fs.createWriteStream(outputPath);
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
      fs.unlink(outputPath, () => {});
      const detail = stderr.trim() || `code de sortie ${exitCode}`;
      logger.error(`${command} a échoué`, {
        instance: instance.id,
        command,
        args,
        code: exitCode,
        stderr: detail,
      });
      throw new Error(`${command} a échoué (${instance.id}) : ${detail}`);
    }
  } catch (err) {
    output.destroy();
    fs.unlink(outputPath, () => {});
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
  const outputPath = path.join(config.backupDir, filename);

  return dumpToGzipFile({
    command: instance.bin.pgDump,
    args: ['--no-owner', '--no-acl', '-d', database],
    outputPath,
    instance,
    config,
    logger,
    label: database,
  });
}

async function backupRoles(instance, config, logger, timestamp) {
  const filename = `${instance.id}_roles_${timestamp}.sql.gz`;
  const outputPath = path.join(config.backupDir, filename);

  return dumpToGzipFile({
    command: instance.bin.pgDumpall,
    args: ['--roles-only'],
    outputPath,
    instance,
    config,
    logger,
    label: 'roles',
  });
}

async function runBackup(config, logger) {
  const timestamp = formatTimestamp();
  const results = [];

  logger.info('Démarrage des sauvegardes', {
    instances: config.instances.map((i) => i.id),
    backupDir: config.backupDir,
    dryRun: config.dryRun,
    configSource: config.configSource,
  });

  for (const instance of config.instances) {
    logger.info(`Instance ${instance.id}`, {
      host: instance.host,
      port: instance.port,
      databases: instance.databases,
      backupRoles: instance.backupRoles,
      pgDump: instance.bin.pgDump,
    });

    for (const database of instance.databases) {
      logger.info(`Sauvegarde de la base ${database}`, { instance: instance.id });
      const result = await backupDatabase(instance, database, config, logger, timestamp);
      results.push(result);
    }

    if (instance.backupRoles) {
      logger.info('Sauvegarde des rôles PostgreSQL', { instance: instance.id });
      const result = await backupRoles(instance, config, logger, timestamp);
      results.push(result);
    }
  }

  logger.info('Sauvegardes terminées', { count: results.length });
  return results;
}

module.exports = { runBackup, buildPgEnv };
