'use strict';

const path = require('path');
const { loadEnv } = require('../env');
const { loadLegacyConfig } = require('./legacy');
const { loadInstancesFromEnv } = require('./instances-env');
const { loadInstancesFromYaml } = require('./instances-yaml');
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

  if (env.CONFIG_FILE) {
    config = loadInstancesFromYaml(env.CONFIG_FILE, env);
  } else if (env.PG_INSTANCES) {
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
  const basename = path.basename(filePath, '.sql.gz');

  if (basename === 'roles') {
    return findInstanceById(config, 'default') || config.instances[0] || null;
  }

  for (const instance of config.instances) {
    if (basename === `${instance.id}_roles`) {
      return instance;
    }
  }

  for (const instance of config.instances) {
    const prefix = `${instance.id}_`;
    if (basename.startsWith(prefix)) {
      return instance;
    }
  }

  const defaultInstance = findInstanceById(config, 'default') || config.instances[0];

  if (defaultInstance) {
    for (const db of defaultInstance.databases) {
      if (basename.startsWith(`${db}_`)) {
        return defaultInstance;
      }
    }

    if (config.instances.length === 1) {
      return defaultInstance;
    }
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
