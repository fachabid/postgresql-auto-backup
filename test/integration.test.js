'use strict';

// Test de bout en bout contre un vrai PostgreSQL. Ignoré sauf si PG_INTEGRATION=1.
// Utilise les variables standard PGHOST / PGPORT / PGUSER / PGPASSWORD de l'environnement.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tmpDir, runCli } = require('./helpers');

const enabled = process.env.PG_INTEGRATION === '1';
const SRC = `pgbackup_it_src_${process.pid}`;
const DST = `pgbackup_it_dst_${process.pid}`;

function psql(db, sql) {
  const r = spawnSync('psql', ['-X', '-qAt', '-d', db, '-c', sql], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('backup puis restore sur un vrai PostgreSQL : les données sont identiques', { skip: !enabled }, (t) => {
  t.after(() => {
    psql('postgres', `DROP DATABASE IF EXISTS ${SRC}`);
    psql('postgres', `DROP DATABASE IF EXISTS ${DST}`);
  });

  psql('postgres', `CREATE DATABASE ${SRC}`);
  psql('postgres', `CREATE DATABASE ${DST}`);
  psql(SRC, `CREATE TABLE people(id serial primary key, name text);
             INSERT INTO people(name) SELECT 'p' || g FROM generate_series(1, 500) g`);

  const backups = path.join(tmpDir(), 'backups');
  const env = {
    PGHOST: process.env.PGHOST || 'localhost',
    PGPORT: process.env.PGPORT || '5432',
    PGUSER: process.env.PGUSER || 'postgres',
    PGPASSWORD: process.env.PGPASSWORD || 'unused',
    PGPASSFILE: process.env.PGPASSFILE,
    BACKUP_DIR: backups,
    BACKUP_DATABASES: SRC,
    BACKUP_ROLES: 'true',
  };

  const backup = runCli(['run'], env);
  assert.equal(backup.code, 0, backup.stderr);

  const files = fs.readdirSync(backups);
  const dump = files.find((f) => f.startsWith(`default_${SRC}_`));
  assert.ok(dump, `dump introuvable dans ${files}`);
  assert.ok(files.some((f) => f.startsWith('default_roles_')));

  const restore = runCli(['restore', '--file', path.join(backups, dump), '--database', DST], env);
  assert.equal(restore.code, 0, restore.stderr);
  assert.equal(psql(DST, 'SELECT count(*) FROM people'), '500');

  // Restaurer une 2e fois échoue (objets existants) : le code de sortie doit être non nul.
  const again = runCli(['restore', '--file', path.join(backups, dump), '--database', DST], env);
  assert.notEqual(again.code, 0);
  assert.equal(psql(DST, 'SELECT count(*) FROM people'), '500');
});
