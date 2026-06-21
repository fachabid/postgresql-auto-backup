'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');
const { formatTimestamp } = require('./logger');

function buildPgEnv(config) {
  const env = {
    ...process.env,
    PGHOST: config.pg.host,
    PGPORT: config.pg.port,
    PGUSER: config.pg.user,
  };

  if (config.pg.password) {
    env.PGPASSWORD = config.pg.password;
  }

  if (config.pg.passfile) {
    env.PGPASSFILE = config.pg.passfile;
  }

  return env;
}

async function dumpToGzipFile({ command, args, outputPath, config, logger, label }) {
  if (config.dryRun) {
    logger.info('[DRY-RUN] Sauvegarde simulée', {
      command,
      args,
      outputPath,
      label,
    });
    return { outputPath, dryRun: true };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const child = spawn(command, args, {
    env: buildPgEnv(config),
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
      logger.error(`${command} a échoué`, { command, args, code: exitCode, stderr: detail });
      throw new Error(`${command} a échoué : ${detail}`);
    }
  } catch (err) {
    output.destroy();
    fs.unlink(outputPath, () => {});
    throw err;
  }

  const stats = fs.statSync(outputPath);
  logger.info('Sauvegarde créée', {
    label,
    outputPath,
    sizeBytes: stats.size,
  });

  return { outputPath, sizeBytes: stats.size, dryRun: false };
}

async function backupDatabase(database, config, logger, timestamp) {
  const filename = `${database}_${timestamp}.sql.gz`;
  const outputPath = path.join(config.backupDir, filename);

  return dumpToGzipFile({
    command: 'pg_dump',
    args: ['--no-owner', '--no-acl', '-d', database],
    outputPath,
    config,
    logger,
    label: database,
  });
}

async function backupRoles(config, logger, timestamp) {
  const filename = `roles_${timestamp}.sql.gz`;
  const outputPath = path.join(config.backupDir, filename);

  return dumpToGzipFile({
    command: 'pg_dumpall',
    args: ['--roles-only'],
    outputPath,
    config,
    logger,
    label: 'roles',
  });
}

async function runBackup(config, logger) {
  const timestamp = formatTimestamp();
  const results = [];

  logger.info('Démarrage des sauvegardes', {
    databases: config.databases,
    backupDir: config.backupDir,
    backupRoles: config.backupRoles,
    dryRun: config.dryRun,
  });

  for (const database of config.databases) {
    logger.info(`Sauvegarde de la base ${database}`);
    const result = await backupDatabase(database, config, logger, timestamp);
    results.push(result);
  }

  if (config.backupRoles) {
    logger.info('Sauvegarde des rôles PostgreSQL');
    const result = await backupRoles(config, logger, timestamp);
    results.push(result);
  }

  logger.info('Sauvegardes terminées', { count: results.length });
  return results;
}

module.exports = { runBackup, buildPgEnv };
