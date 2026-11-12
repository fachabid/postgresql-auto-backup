'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir } = require('./helpers');
const { cleanupOldBackups } = require('../src/cleanup');

const silent = { info() {}, warn() {}, error() {} };
const DAY = 86400000;

function makeBackup(dir, name, ageDays) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'x');
  const t = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(file, t, t);
}

const ts = (day) => `2026-01-${String(day).padStart(2, '0')}_02-00-00`;

test('supprime les fichiers expirés au-delà du minimum conservé', async () => {
  const dir = tmpDir();
  for (let d = 1; d <= 5; d += 1) makeBackup(dir, `a_db_${ts(d)}.sql.gz`, 100 - d);

  const res = await cleanupOldBackups(
    { backupDir: dir, retentionDays: 30, minBackupsKept: 2, dryRun: false }, silent);

  assert.deepEqual(res, { deleted: 3, kept: 2 });
  assert.deepEqual(fs.readdirSync(dir).sort(), [`a_db_${ts(4)}.sql.gz`, `a_db_${ts(5)}.sql.gz`]);
});

test('ne vide jamais le répertoire quand tout est expiré', async () => {
  const dir = tmpDir();
  makeBackup(dir, `a_db_${ts(1)}.sql.gz`, 400);
  await cleanupOldBackups({ backupDir: dir, retentionDays: 30, minBackupsKept: 1, dryRun: false }, silent);
  assert.equal(fs.readdirSync(dir).length, 1);
});

test('le minimum est appliqué par base, pas globalement', async () => {
  const dir = tmpDir();
  makeBackup(dir, `a_x_${ts(1)}.sql.gz`, 100);
  makeBackup(dir, `a_y_${ts(1)}.sql.gz`, 100);
  await cleanupOldBackups({ backupDir: dir, retentionDays: 30, minBackupsKept: 1, dryRun: false }, silent);
  assert.equal(fs.readdirSync(dir).length, 2);
});

test('ignore les fichiers hors format, supprime les .tmp abandonnés', async () => {
  const dir = tmpDir();
  makeBackup(dir, 'notes.sql.gz', 400);
  makeBackup(dir, `a_db_${ts(1)}.sql.gz.tmp`, 5);
  makeBackup(dir, `a_db_${ts(2)}.sql.gz.tmp`, 0);
  await cleanupOldBackups({ backupDir: dir, retentionDays: 30, minBackupsKept: 0, dryRun: false }, silent);
  assert.deepEqual(fs.readdirSync(dir).sort(), [`a_db_${ts(2)}.sql.gz.tmp`, 'notes.sql.gz']);
});

test('dry-run : rien n\'est supprimé', async () => {
  const dir = tmpDir();
  makeBackup(dir, `a_db_${ts(1)}.sql.gz`, 400);
  const res = await cleanupOldBackups({ backupDir: dir, retentionDays: 30, minBackupsKept: 0, dryRun: true }, silent);
  assert.equal(res.deleted, 1);
  assert.equal(fs.readdirSync(dir).length, 1);
});

test('répertoire absent : pas d\'erreur', async () => {
  const res = await cleanupOldBackups(
    { backupDir: path.join(tmpDir(), 'absent'), retentionDays: 30, dryRun: false }, silent);
  assert.deepEqual(res, { deleted: 0, kept: 0 });
});
