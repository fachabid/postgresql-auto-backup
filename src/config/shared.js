'use strict';

const path = require('path');

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

function parseInstanceList(value) {
  if (!value || !String(value).trim()) {
    return [];
  }

  return String(value)
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
}

function loadGlobalSettings(env = process.env) {
  const errors = [];
  let retentionDays;

  try {
    retentionDays = parsePositiveInt(env.RETENTION_DAYS, 30);
  } catch (err) {
    errors.push(err.message);
    retentionDays = 30;
  }

  return {
    backupDir: path.resolve(env.BACKUP_DIR || '/var/backups/postgresql'),
    retentionDays,
    dryRun: parseBoolean(env.DRY_RUN, false),
    logFormat: env.LOG_FORMAT === 'json' ? 'json' : 'text',
    logFile: env.LOG_FILE ? path.resolve(env.LOG_FILE) : null,
    errors,
  };
}

function configError(errors) {
  const error = new Error(`Erreur de configuration :\n- ${errors.join('\n- ')}`);
  error.exitCode = EXIT.CONFIG_ERROR;
  return error;
}

module.exports = {
  EXIT,
  parseBoolean,
  parsePositiveInt,
  parseDatabaseList,
  parseInstanceList,
  loadGlobalSettings,
  configError,
};
