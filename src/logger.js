'use strict';

const fs = require('fs');
const path = require('path');

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function serializeText(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level.toUpperCase()} ${message}${metaStr}`;
}

function serializeJson(level, message, meta) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

function createLogger(config) {
  const format = config.logFormat || 'text';
  let fileStream = null;

  if (config.logFile) {
    fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
    fileStream = fs.createWriteStream(config.logFile, { flags: 'a' });
  }

  function write(level, message, meta = {}, stream = process.stdout) {
    const line =
      format === 'json'
        ? serializeJson(level, message, meta)
        : serializeText(level, message, meta);

    stream.write(`${line}\n`);

    if (fileStream) {
      fileStream.write(`${line}\n`);
    }
  }

  return {
    info(message, meta) {
      write('info', message, meta, process.stdout);
    },
    warn(message, meta) {
      write('warn', message, meta, process.stderr);
    },
    error(message, meta) {
      write('error', message, meta, process.stderr);
    },
    close() {
      if (fileStream) {
        fileStream.end();
      }
    },
  };
}

module.exports = { createLogger, formatTimestamp };
