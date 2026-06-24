'use strict';

const fs = require('fs');
const path = require('path');
const { resolvePgBinaries } = require('./binaries');
const { normalizeInstance } = require('./schema');
const { parseBoolean, loadGlobalSettings, configError } = require('./shared');

function parseScalar(value) {
  const trimmed = String(value).trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseInlineList(value) {
  const inner = value.trim().slice(1, -1);
  if (!inner.trim()) {
    return [];
  }

  return inner.split(',').map((item) => parseScalar(item.trim()));
}

function parseYaml(content) {
  const result = { instances: [] };
  let currentInstance = null;
  let inBin = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.split('#')[0];
    if (!line.trim()) {
      continue;
    }

    const trimmed = line.trim();

    if (trimmed.startsWith('- id:')) {
      currentInstance = {
        id: parseScalar(trimmed.slice(5)),
        bin: {},
      };
      result.instances.push(currentInstance);
      inBin = false;
      continue;
    }

    if (!currentInstance) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, colonIndex).trim();
      const valuePart = trimmed.slice(colonIndex + 1).trim();

      if (valuePart.startsWith('[')) {
        result[key] = parseInlineList(valuePart);
      } else if (valuePart) {
        result[key] = parseScalar(valuePart);
      }
      continue;
    }

    if (trimmed === 'bin:') {
      inBin = true;
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const valuePart = trimmed.slice(colonIndex + 1).trim();
    const parsedValue = valuePart.startsWith('[')
      ? parseInlineList(valuePart)
      : parseScalar(valuePart);

    if (inBin) {
      currentInstance.bin[key] = parsedValue;
    } else {
      inBin = false;
      currentInstance[key] = parsedValue;
    }
  }

  return result;
}

function mapYamlInstance(raw) {
  const version = raw.version;
  const binBlock = raw.bin || {};

  return normalizeInstance({
    id: raw.id,
    host: raw.host,
    port: raw.port,
    user: raw.user,
    password: raw.password,
    passfile: raw.passfile,
    databases: raw.databases || [],
    backupRoles: parseBoolean(raw.backupRoles, false),
    bin: resolvePgBinaries({
      pgDump: binBlock.pgDump,
      pgDumpall: binBlock.pgDumpall,
      psql: binBlock.psql,
      version,
    }),
  });
}

function loadInstancesFromYaml(configFile, env = process.env) {
  const resolved = path.resolve(configFile);

  if (!fs.existsSync(resolved)) {
    throw configError([`Fichier de configuration introuvable : ${resolved}`]);
  }

  const errors = [];
  const global = loadGlobalSettings(env);
  errors.push(...global.errors);

  let doc;
  try {
    doc = parseYaml(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw configError([`Erreur de lecture YAML : ${err.message}`]);
  }

  const instances = (doc.instances || []).map(mapYamlInstance);

  if (instances.length === 0) {
    errors.push('Le fichier YAML doit définir au moins une instance');
  }

  if (errors.length > 0) {
    throw configError(errors);
  }

  return {
    instances,
    backupDir: doc.backupDir
      ? path.resolve(String(doc.backupDir))
      : global.backupDir,
    retentionDays: doc.retentionDays ?? global.retentionDays,
    backupRoles: instances.some((i) => i.backupRoles),
    dryRun: global.dryRun,
    logFormat: global.logFormat,
    logFile: global.logFile,
    configSource: 'yaml',
    configFile: resolved,
  };
}

module.exports = { loadInstancesFromYaml, parseYaml };
