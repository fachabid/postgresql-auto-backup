'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBackupName, isRolesBackup } = require('../src/filenames');

const TS = '2026-06-06_02-00-01';

test('parseBackupName extrait le stem et l\'horodatage', () => {
  assert.deepEqual(parseBackupName(`/x/pg14_ile_db_${TS}.sql.gz`), {
    stem: 'pg14_ile_db',
    timestamp: TS,
  });
  assert.deepEqual(parseBackupName(`roles_${TS}.sql.gz`), { stem: 'roles', timestamp: TS });
});

test('parseBackupName rejette les noms hors format', () => {
  assert.equal(parseBackupName('notes.sql.gz'), null);
  assert.equal(parseBackupName(`db_${TS}.sql`), null);
  assert.equal(parseBackupName(`db_${TS}.sql.gz.tmp`), null);
});

test('isRolesBackup : ancien et nouveau format (régression de la branche multi-instances)', () => {
  assert.equal(isRolesBackup(`roles_${TS}.sql.gz`, 'default'), true);
  assert.equal(isRolesBackup(`pg14_roles_${TS}.sql.gz`, 'pg14'), true);
  assert.equal(isRolesBackup(`pg14_roles_${TS}.sql.gz`), true);
});

test('isRolesBackup ne confond pas une base avec des rôles', () => {
  assert.equal(isRolesBackup(`pg14_ile_db_${TS}.sql.gz`, 'pg14'), false);
  assert.equal(isRolesBackup(`pg16_roles_${TS}.sql.gz`, 'pg14'), false);
});
