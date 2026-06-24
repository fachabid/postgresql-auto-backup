'use strict';

const { resolvePgBinaries } = require('./binaries');
const { normalizeInstance } = require('./schema');
const {
  parseBoolean,
  parseDatabaseList,
  loadGlobalSettings,
  configError,
} = require('./shared');

function loadLegacyConfig(env = process.env) {
  const errors = [];
  const global = loadGlobalSettings(env);
  errors.push(...global.errors);

  const pgUser = env.PGUSER;
  const pgPassword = env.PGPASSWORD;
  const databases = parseDatabaseList(env.BACKUP_DATABASES);

  if (!pgUser) {
    errors.push('PGUSER est obligatoire');
  }

  if (!pgPassword && !env.PGPASSFILE) {
    errors.push('PGPASSWORD ou PGPASSFILE est obligatoire');
  }

  if (databases.length === 0) {
    errors.push('BACKUP_DATABASES doit contenir au moins une base');
  }

  if (errors.length > 0) {
    throw configError(errors);
  }

  const instance = normalizeInstance({
    id: 'default',
    host: env.PGHOST || 'localhost',
    port: env.PGPORT || '5432',
    user: pgUser,
    password: pgPassword,
    passfile: env.PGPASSFILE,
    databases,
    backupRoles: parseBoolean(env.BACKUP_ROLES, false),
    bin: resolvePgBinaries({
      pgDump: env.PG_DUMP,
      pgDumpall: env.PG_DUMPALL,
      psql: env.PSQL,
      version: env.PG_VERSION,
    }),
  });

  return {
    instances: [instance],
    backupDir: global.backupDir,
    retentionDays: global.retentionDays,
    backupRoles: instance.backupRoles,
    dryRun: global.dryRun,
    logFormat: global.logFormat,
    logFile: global.logFile,
    configSource: 'legacy',
  };
}

module.exports = { loadLegacyConfig };
