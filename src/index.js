'use strict';

const { loadConfig, EXIT, parseBoolean } = require('./config');
const { createLogger } = require('./logger');
const { runBackup } = require('./backup');
const { cleanupOldBackups } = require('./cleanup');
const { restoreBackup } = require('./restore');

const USAGE = `
Usage:
  node src/index.js [--dry-run] run
  node src/index.js [--dry-run] backup
  node src/index.js [--dry-run] cleanup
  node src/index.js restore --file <chemin.sql.gz> [--database <nom>] [--instance <id>]

Commandes:
  run       Exécute backup puis cleanup (utilisé par systemd)
  backup    Sauvegarde les bases configurées
  cleanup   Supprime les fichiers de plus de RETENTION_DAYS jours
  restore   Restaure un fichier .sql.gz

Options:
  --dry-run Simule l'opération sans modifier le système
  --file    Chemin du fichier de sauvegarde (.sql.gz)
  --database Nom de la base cible (obligatoire sauf dump de rôles)
  --instance Identifiant PostgreSQL (ex. pg14, default) si non déductible du fichier
`.trim();

function parseArgs(argv) {
  const args = [...argv];
  let dryRun = parseBoolean(process.env.DRY_RUN, false);
  const positional = [];
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--file') {
      options.file = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--database') {
      options.database = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--instance') {
      options.instance = args[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Option inconnue : ${arg}`);
    }

    positional.push(arg);
  }

  return {
    command: positional[0] || 'run',
    dryRun,
    options,
  };
}

async function main() {
  let logger;

  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (['help', '--help', '-h'].includes(parsed.command)) {
      console.log(USAGE);
      process.exit(EXIT.SUCCESS);
    }

    if (parsed.dryRun) {
      process.env.DRY_RUN = 'true';
    }

    const config = loadConfig();
    config.dryRun = config.dryRun || parsed.dryRun;
    logger = createLogger(config);

    switch (parsed.command) {
      case 'backup':
        await runBackup(config, logger);
        break;

      case 'cleanup':
        await cleanupOldBackups(config, logger);
        break;

      case 'run': {
        await runBackup(config, logger);
        try {
          await cleanupOldBackups(config, logger);
        } catch (err) {
          logger.error('Échec du nettoyage', { error: err.message });
          logger.close();
          process.exit(EXIT.CLEANUP_FAILED);
        }
        break;
      }

      case 'restore':
        await restoreBackup(config, logger, parsed.options);
        break;

      default:
        throw new Error(`Commande inconnue : ${parsed.command}\n\n${USAGE}`);
    }

    logger.close();
    process.exit(EXIT.SUCCESS);
  } catch (err) {
    const exitCode = err.exitCode || EXIT.BACKUP_FAILED;
    const message = err.message || String(err);

    if (logger) {
      logger.error(message);
      logger.close();
    } else {
      console.error(message);
    }

    process.exit(exitCode);
  }
}

main();
