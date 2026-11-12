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

    if (['--file', '--database', '--instance'].includes(arg) && (args[i + 1] === undefined || args[i + 1].startsWith('-'))) {
      throw new Error(`L'option ${arg} attend une valeur`);
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

    if (arg === '--help' || arg === '-h') {
      positional.push('help');
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

async function execute(parsed, config, logger) {
  switch (parsed.command) {
    case 'backup':
      await runBackup(config, logger);
      break;

    case 'cleanup':
      await cleanupOldBackups(config, logger);
      break;

    case 'run': {
      // Pas de nettoyage si des sauvegardes ont échoué : runBackup lève dans ce cas.
      await runBackup(config, logger);
      try {
        await cleanupOldBackups(config, logger);
      } catch (err) {
        err.message = `Échec du nettoyage : ${err.message}`;
        err.exitCode = EXIT.CLEANUP_FAILED;
        throw err;
      }
      break;
    }

    case 'restore':
      await restoreBackup(config, logger, parsed.options);
      break;

    default:
      throw new Error(`Commande inconnue : ${parsed.command}\n\n${USAGE}`);
  }
}

async function main() {
  let logger;
  let exitCode = EXIT.SUCCESS;

  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (['help', '--help', '-h'].includes(parsed.command)) {
      console.log(USAGE);
      return;
    }

    if (parsed.dryRun) {
      process.env.DRY_RUN = 'true';
    }

    const config = loadConfig();
    config.dryRun = config.dryRun || parsed.dryRun;
    logger = createLogger(config);

    await execute(parsed, config, logger);
  } catch (err) {
    exitCode = err.exitCode || EXIT.BACKUP_FAILED;
    const message = err.message || String(err);

    if (logger) {
      logger.error(message);
    } else {
      console.error(message);
    }
  }

  if (logger) {
    await logger.close();
  }

  // exitCode plutôt que process.exit() : laisse les flux se vider.
  process.exitCode = exitCode;
}

main();
