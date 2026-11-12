'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { tmpDir, makeFakeBinaries, runCli, baseEnv } = require('./helpers');

function setup(extra = {}) {
  const dir = tmpDir();
  const bins = makeFakeBinaries(dir);
  const psqlLog = path.join(dir, 'psql.log');
  const env = baseEnv(dir, bins, { BACKUP_DATABASES: 'good', PSQL_LOG: psqlLog, ...extra });
  const backup = (name, sql = 'SELECT 1;') => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, zlib.gzipSync(sql));
    return file;
  };
  return { env, psqlLog, backup };
}

test('restore base : transaction unique + arrêt à la première erreur, SQL transmis', () => {
  const { env, psqlLog, backup } = setup();
  const file = backup('default_good_2026-06-06_02-00-01.sql.gz', 'CREATE TABLE z();');
  const { code } = runCli(['restore', '--file', file, '--database', 'target'], env);

  assert.equal(code, 0);
  const log = fs.readFileSync(psqlLog, 'utf8');
  assert.match(log, /ON_ERROR_STOP=1/);
  assert.match(log, /--single-transaction/);
  assert.match(log, /-d target/);
  assert.match(log, /CREATE TABLE z\(\);/);
});

test('restore : un échec de psql donne un code de sortie non nul', () => {
  const { env, backup } = setup({ PSQL_FAIL: '1' });
  const file = backup('default_good_2026-06-06_02-00-01.sql.gz');
  const { code, stderr } = runCli(['restore', '--file', file, '--database', 't'], env);
  assert.equal(code, 1);
  assert.match(stderr, /Restauration échouée/);
});

for (const name of ['default_roles_2026-06-06_02-00-01.sql.gz', 'roles_2026-06-06_02-00-01.sql.gz']) {
  test(`restore rôles (${name}) : détecté sans --database`, () => {
    const { env, psqlLog, backup } = setup();
    const { code } = runCli(['restore', '--file', backup(name, 'CREATE ROLE r;')], env);
    assert.equal(code, 0);
    const log = fs.readFileSync(psqlLog, 'utf8');
    assert.doesNotMatch(log, /--single-transaction/);
    assert.match(log, /CREATE ROLE r;/);
  });
}

test('restore base : --database obligatoire', () => {
  const { env, backup } = setup();
  const { code, stderr } = runCli(['restore', '--file', backup('default_good_2026-06-06_02-00-01.sql.gz')], env);
  assert.equal(code, 1);
  assert.match(stderr, /--database est obligatoire/);
});

test('restore : fichier introuvable ou extension invalide', () => {
  const { env } = setup();
  assert.equal(runCli(['restore', '--file', '/nope/x.sql.gz', '--database', 'd'], env).code, 1);
  assert.equal(runCli(['restore', '--file', __filename, '--database', 'd'], env).code, 1);
});
