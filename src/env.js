'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Charge un fichier .env et fusionne les clés dans process.env
 * sans écraser les variables déjà définies.
 */
function loadEnvFile(envPath) {
  const resolved = path.resolve(envPath);

  if (!fs.existsSync(resolved)) {
    return;
  }

  const content = fs.readFileSync(resolved, 'utf8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Cherche et charge un fichier .env depuis le répertoire courant
 * ou le répertoire parent du script.
 */
function loadEnv(options = {}) {
  const candidates = options.paths || [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadEnvFile(candidate);
      return candidate;
    }
  }

  return null;
}

module.exports = { loadEnv, loadEnvFile };
