'use strict';

const path = require('path');

const EXTENSION = '.sql.gz';
const TIMESTAMP_RE = /_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})$/;

/**
 * Découpe un nom de fichier de sauvegarde en { stem, timestamp }.
 * `stem` est le nom sans extension ni horodatage (ex. `pg14_roles`, `ile_db`).
 * Retourne null si le nom ne suit pas le format `{stem}_{YYYY-MM-DD_HH-mm-ss}.sql.gz`.
 */
function parseBackupName(filePath) {
  const base = path.basename(filePath);

  if (!base.endsWith(EXTENSION)) {
    return null;
  }

  const name = base.slice(0, -EXTENSION.length);
  const match = TIMESTAMP_RE.exec(name);

  if (!match) {
    return null;
  }

  return { stem: name.slice(0, match.index), timestamp: match[1] };
}

/**
 * Vrai pour `roles_<ts>.sql.gz` (ancien format) et `<instance>_roles_<ts>.sql.gz`.
 * Si instanceId est fourni, seul `<instanceId>_roles` (ou `roles` pour `default`) est accepté.
 */
function isRolesBackup(filePath, instanceId = null) {
  const parsed = parseBackupName(filePath);

  if (!parsed) {
    return false;
  }

  if (parsed.stem === 'roles') {
    return true;
  }

  if (instanceId) {
    return parsed.stem === `${instanceId}_roles`;
  }

  return parsed.stem.endsWith('_roles');
}

module.exports = { parseBackupName, isRolesBackup, EXTENSION };
