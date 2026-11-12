'use strict';

const { resolvePgBinaries } = require('./binaries');
const { normalizeInstance } = require('./schema');
const {
  parseBoolean,
  parseDatabaseList,
  parseInstanceList,
  loadGlobalSettings,
  configError,
} = require('./shared');

function getInstanceEnv(env, instanceId, suffix) {
  const variants = [
    `${instanceId}_${suffix}`,
    `${instanceId.toUpperCase()}_${suffix}`,
    `${instanceId.toLowerCase()}_${suffix}`,
  ];

  for (const key of variants) {
    if (env[key] !== undefined && env[key] !== '') {
      return env[key];
    }
  }

  return undefined;
}

function loadInstancesFromEnv(env = process.env) {
  const errors = [];
  const global = loadGlobalSettings(env);
  errors.push(...global.errors);

  const instanceIds = parseInstanceList(env.PG_INSTANCES);

  if (instanceIds.length === 0) {
    errors.push('PG_INSTANCES doit contenir au moins une instance');
    throw configError(errors);
  }

  const instances = instanceIds.map((id) => {
    const databases = parseDatabaseList(getInstanceEnv(env, id, 'DATABASES'));

    if (databases.length === 0) {
      errors.push(`Instance "${id}" : DATABASES est obligatoire`);
    }

    const user = getInstanceEnv(env, id, 'USER') || env.PGUSER;
    const password = getInstanceEnv(env, id, 'PASSWORD') || env.PGPASSWORD;
    const passfile = getInstanceEnv(env, id, 'PASSFILE') || env.PGPASSFILE;

    if (!user) {
      errors.push(`Instance "${id}" : USER ou PGUSER global est obligatoire`);
    }

    if (!password && !passfile) {
      errors.push(`Instance "${id}" : PASSWORD ou PGPASSWORD global est obligatoire`);
    }

    return normalizeInstance({
      id,
      host: getInstanceEnv(env, id, 'HOST') || env.PGHOST || 'localhost',
      port: getInstanceEnv(env, id, 'PORT') || env.PGPORT || '5432',
      user,
      password,
      passfile,
      databases,
      backupRoles: parseBoolean(
        getInstanceEnv(env, id, 'BACKUP_ROLES'),
        parseBoolean(env.BACKUP_ROLES, false),
      ),
      bin: resolvePgBinaries({
        pgDump: getInstanceEnv(env, id, 'PG_DUMP') || env.PG_DUMP,
        pgDumpall: getInstanceEnv(env, id, 'PG_DUMPALL') || env.PG_DUMPALL,
        psql: getInstanceEnv(env, id, 'PSQL') || env.PSQL,
        version: getInstanceEnv(env, id, 'VERSION'),
      }),
    });
  });

  if (errors.length > 0) {
    throw configError(errors);
  }

  return {
    instances,
    backupDir: global.backupDir,
    retentionDays: global.retentionDays,
    minBackupsKept: global.minBackupsKept,
    backupRoles: instances.some((i) => i.backupRoles),
    dryRun: global.dryRun,
    logFormat: global.logFormat,
    logFile: global.logFile,
    configSource: 'env-instances',
  };
}

module.exports = { loadInstancesFromEnv, getInstanceEnv };
