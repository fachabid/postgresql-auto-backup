'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, resolveInstanceFromFilename } = require('../src/config');

const withEnv = (env, fn) => {
  const saved = process.env;
  process.env = { ...env };
  try {
    return fn();
  } finally {
    process.env = saved;
  }
};

const load = (env) => withEnv({ ...env, PATH: '' }, () => loadConfig({ skipEnvFile: true }));

test('mode legacy : une instance "default"', () => {
  const config = load({ PGUSER: 'u', PGPASSWORD: 'p', BACKUP_DATABASES: 'a,b', DRY_RUN: 'true' });
  assert.equal(config.instances.length, 1);
  assert.equal(config.instances[0].id, 'default');
  assert.deepEqual(config.instances[0].databases, ['a', 'b']);
  assert.equal(config.retentionDays, 30);
  assert.equal(config.minBackupsKept, 3);
});

test('mode multi-instance avec repli sur PGUSER/PGPASSWORD', () => {
  const config = load({
    PG_INSTANCES: 'pg14,pg16',
    PGUSER: 'u',
    PGPASSWORD: 'p',
    pg14_DATABASES: 'a',
    pg16_DATABASES: 'b',
    pg16_PORT: '5433',
    DRY_RUN: 'true',
  });
  assert.deepEqual(config.instances.map((i) => [i.id, i.port]), [['pg14', '5432'], ['pg16', '5433']]);
});

test('configuration invalide : erreurs listées, code de sortie 2', () => {
  assert.throws(
    () => load({ RETENTION_DAYS: 'abc' }),
    (err) => err.exitCode === 2 && /PGUSER/.test(err.message) && /RETENTION_DAYS/.test(err.message),
  );
});

test('la variable CONFIG_FILE (YAML) n\'est plus prise en charge', () => {
  const config = load({
    CONFIG_FILE: '/nope.yaml', PGUSER: 'u', PGPASSWORD: 'p', BACKUP_DATABASES: 'a', DRY_RUN: 'true',
  });
  assert.equal(config.configSource, 'legacy');
});

test('resolveInstanceFromFilename : préfixe le plus long, ancien format, rôles', () => {
  const config = load({
    PG_INSTANCES: 'pg1,pg14,default',
    PGUSER: 'u',
    PGPASSWORD: 'p',
    pg1_DATABASES: 'x',
    pg14_DATABASES: 'y',
    default_DATABASES: 'legacydb',
    DRY_RUN: 'true',
  });
  const ts = '2026-06-06_02-00-01';
  const id = (file) => resolveInstanceFromFilename(config, file)?.id;

  assert.equal(id(`pg14_y_${ts}.sql.gz`), 'pg14');
  assert.equal(id(`pg1_x_${ts}.sql.gz`), 'pg1');
  assert.equal(id(`pg14_roles_${ts}.sql.gz`), 'pg14');
  assert.equal(id(`roles_${ts}.sql.gz`), 'default');
  assert.equal(id(`legacydb_${ts}.sql.gz`), 'default');
  assert.equal(id(`inconnu_${ts}.sql.gz`), undefined);
});
