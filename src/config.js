'use strict';

const path = require('path');
const { loadEnv } = require('./env');

const EXIT = {
  SUCCESS: 0,
  BACKUP_FAILED: 1,
  CONFIG_ERROR: 2,
  CLEANUP_FAILED: 3,
};

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parsePositiveInt(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Valeur numérique invalide : ${value}`);
  }

  return parsed;
}

function parseDatabaseList(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split(',')
    .map((db) => db.trim())
    .filter(Boolean);
}

function loadConfig(options = {}) {
  if (!options.skipEnvFile) {
    loadEnv();
  }

  const errors = [];

  const pgUser = process.env.PGUSER;
  const pgPassword = process.env.PGPASSWORD;
  const databases = parseDatabaseList(process.env.BACKUP_DATABASES);

  if (!pgUser) {
    errors.push('PGUSER est obligatoire');
  }

  if (!pgPassword && !process.env.PGPASSFILE) {
    errors.push('PGPASSWORD ou PGPASSFILE est obligatoire');
  }

  if (databases.length === 0) {
    errors.push('BACKUP_DATABASES doit contenir au moins une base');
  }

  const backupDir = process.env.BACKUP_DIR || '/var/backups/postgresql';

  let retentionDays;
  try {
    retentionDays = parsePositiveInt(process.env.RETENTION_DAYS, 30);
  } catch (err) {
    errors.push(err.message);
    retentionDays = 30;
  }

  if (errors.length > 0) {
    const error = new Error(`Erreur de configuration :\n- ${errors.join('\n- ')}`);
    error.exitCode = EXIT.CONFIG_ERROR;
    throw error;
  }

  return {
    pg: {
      host: process.env.PGHOST || 'localhost',
      port: String(process.env.PGPORT || '5432'),
      user: pgUser,
      password: pgPassword || undefined,
      passfile: process.env.PGPASSFILE || undefined,
    },
    databases,
    backupDir: path.resolve(backupDir),
    retentionDays,
    backupRoles: parseBoolean(process.env.BACKUP_ROLES, false),
    dryRun: parseBoolean(process.env.DRY_RUN, false),
    logFormat: process.env.LOG_FORMAT === 'json' ? 'json' : 'text',
    logFile: process.env.LOG_FILE ? path.resolve(process.env.LOG_FILE) : null,
  };
}

module.exports = { loadConfig, EXIT, parseBoolean };
