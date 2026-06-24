'use strict';

const fs = require('fs');

function resolvePgBinaries({ pgDump, pgDumpall, psql, version } = {}) {
  if (version) {
    const base = `/usr/lib/postgresql/${version}/bin`;
    return {
      pgDump: pgDump || `${base}/pg_dump`,
      pgDumpall: pgDumpall || `${base}/pg_dumpall`,
      psql: psql || `${base}/psql`,
    };
  }

  return {
    pgDump: pgDump || 'pg_dump',
    pgDumpall: pgDumpall || 'pg_dumpall',
    psql: psql || 'psql',
  };
}

function validateBinaries(instance, dryRun) {
  const errors = [];

  if (dryRun) {
    return errors;
  }

  for (const [name, binPath] of Object.entries(instance.bin)) {
    if (!binPath.includes('/')) {
      continue;
    }

    try {
      fs.accessSync(binPath, fs.constants.X_OK);
    } catch {
      errors.push(
        `Instance "${instance.id}" : binaire ${name} introuvable ou non exécutable : ${binPath}`,
      );
    }
  }

  return errors;
}

module.exports = { resolvePgBinaries, validateBinaries };
