'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'src', 'index.js');

function tmpDir(prefix = 'pgbackup-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Crée de faux pg_dump / pg_dumpall / psql dans un dossier et retourne leurs chemins. */
function makeFakeBinaries(dir) {
  const write = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    return file;
  };

  return {
    pgDump: write(
      'pg_dump',
      `db="\${@: -1}"
if [ "$db" = "bad" ]; then echo 'pg_dump: error: database "bad" does not exist' >&2; exit 1; fi
echo "-- dump of $db"; echo "CREATE TABLE t(i int);"`,
    ),
    pgDumpall: write('pg_dumpall', 'echo "CREATE ROLE app;"'),
    // psql factice : recopie les arguments et l'entrée dans $PSQL_LOG, échoue si $PSQL_FAIL=1
    psql: write(
      'psql',
      `echo "ARGS: $@" >> "$PSQL_LOG"; cat >> "$PSQL_LOG"
if [ "$PSQL_FAIL" = "1" ]; then echo 'ERROR: boom' >&2; exit 3; fi`,
    ),
  };
}

function runCli(args, env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    // env minimal : pas de fuite des PG* de la machine de test
    env: { PATH: process.env.PATH, HOME: os.homedir(), ...env },
    cwd: tmpDir('pgbackup-cwd-'),
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function baseEnv(dir, bins, extra = {}) {
  return {
    PGUSER: 'u',
    PGPASSWORD: 'p',
    BACKUP_DIR: path.join(dir, 'backups'),
    PG_DUMP: bins.pgDump,
    PG_DUMPALL: bins.pgDumpall,
    PSQL: bins.psql,
    ...extra,
  };
}

module.exports = { ROOT, tmpDir, makeFakeBinaries, runCli, baseEnv };
