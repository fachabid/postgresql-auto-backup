'use strict';

const { validateBinaries } = require('./binaries');

function validateInstances(instances, { dryRun = false } = {}) {
  const errors = [];

  if (!instances || instances.length === 0) {
    errors.push('Au moins une instance PostgreSQL est requise');
    return errors;
  }

  const seenIds = new Set();

  for (const instance of instances) {
    if (!instance.id) {
      errors.push('Chaque instance doit avoir un identifiant (id)');
      continue;
    }

    if (seenIds.has(instance.id)) {
      errors.push(`Identifiant d'instance dupliqué : ${instance.id}`);
    }
    seenIds.add(instance.id);

    if (!instance.user) {
      errors.push(`Instance "${instance.id}" : USER est obligatoire`);
    }

    if (!instance.password && !instance.passfile) {
      errors.push(`Instance "${instance.id}" : PASSWORD ou PASSFILE est obligatoire`);
    }

    if (!instance.databases || instance.databases.length === 0) {
      errors.push(`Instance "${instance.id}" : DATABASES doit contenir au moins une base`);
    }

    errors.push(...validateBinaries(instance, dryRun));
  }

  return errors;
}

function normalizeInstance(raw) {
  return {
    id: String(raw.id).toLowerCase(),
    host: raw.host || 'localhost',
    port: String(raw.port || '5432'),
    user: raw.user,
    password: raw.password || undefined,
    passfile: raw.passfile || undefined,
    databases: raw.databases || [],
    backupRoles: Boolean(raw.backupRoles),
    bin: raw.bin,
  };
}

module.exports = { validateInstances, normalizeInstance };
