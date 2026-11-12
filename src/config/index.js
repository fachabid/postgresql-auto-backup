'use strict';

const { loadEnv } = require('../env');
const { parseBackupName } = require('../filenames');
const { loadLegacyConfig } = require('./legacy');
const { loadInstancesFromEnv } = require('./instances-env');
const { validateInstances } = require('./schema');
const {
  EXIT,
  parseBoolean,
  parsePositiveInt,
  parseDatabaseList,
  configError,
} = require('./shared');

function loadConfig(options = {}) {
  if (!options.skipEnvFile) {
    loadEnv();
  }

  const env = process.env;
  let config;

  if (env.PG_INSTANCES) {
    config = loadInstancesFromEnv(env);
  } else {
    config = loadLegacyConfig(env);
  }

  const validationErrors = validateInstances(config.instances, {
    dryRun: config.dryRun,
  });

  if (validationErrors.length > 0) {
    throw configError(validationErrors);
  }

  return config;
}

function findInstanceById(config, instanceId) {
  if (!instanceId) {
    return null;
  }

  const normalized = String(instanceId).toLowerCase();
  return config.instances.find((i) => i.id === normalized) || null;
}

function resolveInstanceFromFilename(config, filePath) {
  const parsed = parseBackupName(filePath);

  if (!parsed) {
    return null;
  }

  const { stem } = parsed;
  const defaultInstance = findInstanceById(config, 'default') || config.instances[0];

  // Ancien format sans préfixe d'instance : `roles_<ts>` et `<db>_<ts>`
  if (stem === 'roles') {
    return defaultInstance || null;
  }

  // Préfixe le plus long d'abord, pour que `pg14` l'emporte sur `pg1`.
  const byIdLength = [...config.instances].sort((a, b) => b.id.length - a.id.length);

  for (const instance of byIdLength) {
    if (stem === `${instance.id}_roles` || stem.startsWith(`${instance.id}_`)) {
      return instance;
    }
  }

  if (defaultInstance && defaultInstance.databases.includes(stem)) {
    return defaultInstance;
  }

  if (config.instances.length === 1) {
    return config.instances[0];
  }

  return null;
}

module.exports = {
  loadConfig,
  findInstanceById,
  resolveInstanceFromFilename,
  EXIT,
  parseBoolean,
  parsePositiveInt,
  parseDatabaseList,
};
