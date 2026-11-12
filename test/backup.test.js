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
  const env = baseEnv(dir, bins, extra);
  return { dir, bins, env, backups: env.BACKUP_DIR };
}

test('backup : fichier gzip valide, nommé instance_base_horodatage, permissions 0600', () => {
  const { env, backups } = setup({ BACKUP_DATABASES: 'good', BACKUP_ROLES: 'true' });
  const { code } = runCli(['backup'], env);
  assert.equal(code, 0);

  const files = fs.readdirSync(backups).sort();
  assert.equal(files.length, 2);
  assert.match(files[0], /^default_good_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/);
  assert.match(files[1], /^default_roles_/);

  const file = path.join(backups, files[0]);
  assert.match(zlib.gunzipSync(fs.readFileSync(file)).toString(), /CREATE TABLE t/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('backup : un échec n\'empêche pas les bases suivantes, code 1, aucun fichier partiel', () => {
  const { env, backups } = setup({ BACKUP_DATABASES: 'bad,good' });
  const { code, stderr } = runCli(['backup'], env);

  assert.equal(code, 1);
  assert.match(stderr, /default\/bad/);

  const files = fs.readdirSync(backups);
  assert.equal(files.length, 1);
  assert.match(files[0], /^default_good_/);
  assert.ok(!files.some((f) => f.endsWith('.tmp')));
});

test('run : pas de nettoyage quand une sauvegarde a échoué', () => {
  const { env, backups } = setup({ BACKUP_DATABASES: 'bad', RETENTION_DAYS: '0', MIN_BACKUPS_KEPT: '0' });
  fs.mkdirSync(backups, { recursive: true });
  const old = path.join(backups, 'default_bad_2020-01-01_00-00-00.sql.gz');
  fs.writeFileSync(old, 'x');
  fs.utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));

  const { code } = runCli(['run'], env);
  assert.equal(code, 1);
  assert.ok(fs.existsSync(old));
});

test('multi-instance : un fichier par instance, binaires par instance', () => {
  const { env, backups } = setup({
    PG_INSTANCES: 'a,b', a_DATABASES: 'good', b_DATABASES: 'good',
  });
  assert.equal(runCli(['backup'], env).code, 0);
  const files = fs.readdirSync(backups);
  assert.ok(files.some((f) => f.startsWith('a_good_')));
  assert.ok(files.some((f) => f.startsWith('b_good_')));
});

test('dry-run : aucun fichier créé', () => {
  const { env, backups } = setup({ BACKUP_DATABASES: 'good' });
  const { code, stdout } = runCli(['--dry-run', 'run'], env);
  assert.equal(code, 0);
  assert.match(stdout, /DRY-RUN/);
  assert.equal(fs.existsSync(backups), false);
});

test('configuration invalide : code 2', () => {
  const { code, stderr } = runCli(['backup'], { PGUSER: 'u' });
  assert.equal(code, 2);
  assert.match(stderr, /Erreur de configuration/);
});

test('LOG_FILE : aucune ligne perdue à la sortie', () => {
  const { dir, env } = setup({ BACKUP_DATABASES: 'good', LOG_FILE: undefined });
  const logFile = path.join(dir, 'log', 'backup.log');
  const { stdout } = runCli(['backup'], { ...env, LOG_FILE: logFile });
  const expected = stdout.trim().split('\n').length;
  assert.equal(fs.readFileSync(logFile, 'utf8').trim().split('\n').length, expected);
});

test('--help fonctionne', () => {
  const { code, stdout } = runCli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /Usage/);
});
