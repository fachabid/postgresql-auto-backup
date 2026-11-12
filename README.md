# postgresql-backup

[![CI](https://github.com/fachabid/postgresql-auto-backup/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fachabid/postgresql-auto-backup/actions/workflows/ci.yml)
[![Licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)

Application Node.js pour automatiser les sauvegardes PostgreSQL sur Ubuntu via `pg_dump`, avec compression gzip, rétention configurable, support multi-instance/multi-version et intégration systemd.

## Fonctionnalités

- Sauvegarde journalière planifiée par **systemd timer**
- Fichiers horodatés : `{instance}_{dbname}_YYYY-MM-DD_HH-mm-ss.sql.gz`
- Compression gzip en streaming (sans fichier temporaire)
- Suppression automatique des backups de plus de 30 jours (configurable)
- Support multi-bases et **multi-instances PostgreSQL** (versions/ports différents)
- Configuration par fichier `.env` (mode simple ou multi-instances)
- Option sauvegarde des rôles (`BACKUP_ROLES=true`)
- Mode dry-run
- Commande de restauration intégrée
- Zéro dépendance npm externe

## Prérequis

- Ubuntu avec PostgreSQL 14+ (une ou plusieurs instances)
- Node.js 18+ installé **au niveau système** (voir [Installation de Node.js](#installation-de-nodejs))
- Client(s) PostgreSQL correspondant(s) : `postgresql-client-14`, `postgresql-client-16`, etc.

```bash
sudo apt update
sudo apt install -y postgresql-client-14

# Multi-version : installer un client par version majeure
# sudo apt install -y postgresql-client-14 postgresql-client-16
# ls /usr/lib/postgresql/14/bin/pg_dump
# ls /usr/lib/postgresql/16/bin/pg_dump

# Vérifier pg_dump
pg_dump --version
```

> **Version du client :** utilisez un `pg_dump`/`psql` de la **même version majeure que le serveur** (ou configurez-le par instance avec `pg14_VERSION=14`). Un client plus récent écrit des commandes que le serveur ne connaît pas (par exemple `SET transaction_timeout` avec PostgreSQL 17) et la restauration échoue sur un serveur plus ancien.

## Installation de Node.js

Le service systemd et les commandes manuelles utilisent **`/usr/bin/node`** sous l'utilisateur **`postgres`**. Node doit donc être installé **au niveau système**, pas uniquement pour un utilisateur.

### Pourquoi pas nvm ?

**nvm** installe Node dans le home d'un utilisateur (`~/.nvm/...`) et le charge via `.bashrc`. Cela ne fonctionne pas pour cet outil car :

- le service tourne sous `User=postgres`, qui n'a pas nvm dans son PATH ;
- `ExecStart=/usr/bin/node` dans le service systemd pointe vers un binaire système ;
- `ProtectHome=true` empêche l'accès aux répertoires home depuis le service.

**Ne pas utiliser nvm** pour ce projet, même s'il est déjà installé pour le développement.

### Option recommandée — NodeSource (Node 22)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifications obligatoires
/usr/bin/node -v                        # doit afficher v18+ (idéalement v22)
sudo -u postgres /usr/bin/node -v     # même résultat
which node                              # doit retourner /usr/bin/node
```

### Option alternative — apt Ubuntu (si version >= 18)

```bash
sudo apt update
sudo apt install -y nodejs
/usr/bin/node -v   # vérifier que la version est >= 18
```

Si la version est inférieure à 18, utilisez NodeSource.

### Si nvm est déjà installé sur le serveur

- Vous pouvez garder nvm pour le développement.
- **Installez quand même** Node système via NodeSource (les deux coexistent).
- Utilisez toujours `/usr/bin/node` pour les backups.
- Ne modifiez pas `ExecStart` pour pointer vers `~/.nvm/...`.

### Checklist avant de continuer

```bash
test -x /usr/bin/node && echo "OK node systeme" || echo "ECHEC"
sudo -u postgres /usr/bin/node -e "console.log('OK postgres')"
```

Les deux commandes doivent réussir avant de cloner le projet et d'activer le timer.

## Installation sur Ubuntu

> Avant de cloner le projet, validez que `/usr/bin/node` fonctionne pour l'utilisateur `postgres` (voir [Installation de Node.js](#installation-de-nodejs)).

### Option A — GitHub (recommandé)

```bash
sudo git clone https://github.com/fachabid/postgresql-auto-backup.git /opt/postgresql-backup
```

GitHub n'accepte plus le mot de passe pour `git clone` en HTTPS. Utilisez un **Personal Access Token** (PAT) ou clonez en **SSH** (`git@github.com:...`).

### Option B — Copie locale

```bash
sudo mkdir -p /opt/postgresql-backup
sudo cp -r . /opt/postgresql-backup/
```

### Configuration et systemd

```bash
# 1. Fichier de configuration (hors repo)
sudo cp /opt/postgresql-backup/.env.example /etc/postgresql-backup.env
sudo chown postgres:postgres /etc/postgresql-backup.env
sudo chmod 600 /etc/postgresql-backup.env
sudo nano /etc/postgresql-backup.env

# 2. Répertoire de sauvegarde (mkdir AVANT chown)
sudo mkdir -p /var/backups/postgresql
sudo chown postgres:postgres /var/backups/postgresql
sudo chmod 700 /var/backups/postgresql

# 3. Activer le timer systemd
sudo cp /opt/postgresql-backup/systemd/postgresql-backup.service /etc/systemd/system/
sudo cp /opt/postgresql-backup/systemd/postgresql-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql-backup.timer
```

### Mise à jour

```bash
cd /opt/postgresql-backup && sudo git pull
sudo systemctl daemon-reload   # si les unités systemd ont changé
```

### Rotation des logs fichier (optionnel)

Si `LOG_FILE` est défini dans `/etc/postgresql-backup.env` :

```bash
sudo mkdir -p /var/log/postgresql-backup
sudo chown postgres:postgres /var/log/postgresql-backup
sudo cp /opt/postgresql-backup/logrotate/postgresql-backup /etc/logrotate.d/
```

Par défaut, les logs vont dans **journald** (rotation automatique).

## Configuration

Le fichier de production est **`/etc/postgresql-backup.env`** — jamais dans le repo Git.

Copier `.env.example` comme base :

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `PGHOST` | non | `localhost` | Hôte PostgreSQL |
| `PGPORT` | non | `5432` | Port |
| `PGUSER` | oui | — | Utilisateur PostgreSQL |
| `PGPASSWORD` | oui* | — | Mot de passe (* ou `PGPASSFILE`) |
| `BACKUP_DATABASES` | oui | — | Bases séparées par virgule, sans espaces |
| `BACKUP_DIR` | non | `/var/backups/postgresql` | Répertoire de sortie |
| `RETENTION_DAYS` | non | `30` | Suppression au-delà de N jours |
| `BACKUP_ROLES` | non | `false` | Dump rôles via `pg_dumpall --roles-only` |
| `DRY_RUN` | non | `false` | Mode simulation |
| `LOG_FORMAT` | non | `text` | `text` ou `json` |
| `LOG_FILE` | non | — | Chemin fichier log optionnel |
| `PG_INSTANCES` | non* | — | Liste d'instances (mode multi) : `pg14,pg16` |
| `MIN_BACKUPS_KEPT` | non | `3` | Sauvegardes les plus récentes conservées par base, même expirées |

\* Mode **legacy** : `PGUSER` + `BACKUP_DATABASES` suffisent. Mode **multi** : `PG_INSTANCES`.

### Mode legacy (une instance — rétrocompatible)

Une instance implicite `default`. Fichiers : `default_{dbname}_{timestamp}.sql.gz`

```env
PGHOST=localhost
PGUSER=postgres
PGPASSWORD=...
BACKUP_DATABASES=ile_db,test_vector_db
```

Les anciens backups `{dbname}_{timestamp}.sql.gz` (sans préfixe) restent restaurables sur l'instance `default`.

### Mode multi-instance (.env)

Plusieurs PostgreSQL sur le même serveur (versions ou ports différents) :

```env
PG_INSTANCES=pg14,pg16

pg14_HOST=localhost
pg14_PORT=5432
pg14_USER=postgres
pg14_PASSWORD=secret14
pg14_DATABASES=ile_db,test_vector_db
pg14_VERSION=14

pg16_HOST=localhost
pg16_PORT=5433
pg16_USER=postgres
pg16_PASSWORD=secret16
pg16_DATABASES=app_new
pg16_VERSION=16
```

- Préfixe instance en majuscules : `pg14_HOST` ou `PG14_HOST`
- `pg14_VERSION=14` résout automatiquement `/usr/lib/postgresql/14/bin/pg_dump`
- Binaires explicites optionnels : `pg14_PG_DUMP`, `pg14_PSQL`, etc.
- Fallback global : `PGUSER` / `PGPASSWORD` si non définis par instance

Fichiers générés : `pg14_ile_db_{timestamp}.sql.gz`, `pg16_app_new_{timestamp}.sql.gz`

### Priorité de chargement

1. `PG_INSTANCES` (.env multi)
2. Mode legacy (`PGHOST`, `BACKUP_DATABASES`, …)

```bash
sudo -u postgres psql -l
```

Exemple legacy :

```env
BACKUP_DATABASES=ile_db,test_vector_db
```

**Sécurité :**

- Ne jamais committer le fichier `.env` ou `/etc/postgresql-backup.env`
- Permissions : `chown postgres:postgres` + `chmod 600` sur le fichier env
- Dossier backup : `chown postgres:postgres` + `chmod 700` sur `/var/backups/postgresql`

## Vérification avant mise en prod

Workflow recommandé après installation :

```bash
# 1. Dry-run
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js --dry-run run'

# 2. Backup réel
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js run'

# 3. Vérifier les fichiers
ls -lh /var/backups/postgresql/
gzip -t /var/backups/postgresql/*.sql.gz

# 4. Test via systemd (sans attendre le timer)
sudo systemctl start postgresql-backup.service
journalctl -u postgresql-backup.service -n 30 --no-pager
```

### Helper bash (optionnel)

Pour éviter de répéter `set -a; source ...`, ajoutez dans votre shell :

```bash
pgbackup() {
  sudo -u postgres bash -c "set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js $*"
}
```

Usage :

```bash
pgbackup run
pgbackup --dry-run run
pgbackup backup
pgbackup cleanup
pgbackup restore --file /var/backups/postgresql/pg14_myapp_DATE.sql.gz --database myapp_restore_test --instance pg14
```

> **Note :** systemd charge `/etc/postgresql-backup.env` automatiquement via `EnvironmentFile=`. Les commandes manuelles ci-dessus doivent charger ce fichier explicitement avec `source`.

## Commandes

Les exemples ci-dessous utilisent le pattern complet. Remplacez par `pgbackup` si vous avez défini le helper.

### Backup manuel (backup + cleanup)

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js run'
```

### Dry-run

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js --dry-run run'
```

### Backup seul

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js backup'
```

### Cleanup seul

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js cleanup'
```

### Vérifier le timer

```bash
systemctl status postgresql-backup.timer
systemctl list-timers | grep postgresql
journalctl -u postgresql-backup.service -f
```

## Codes de sortie

| Code | Signification |
|---|---|
| `0` | Succès |
| `1` | Échec backup ou restauration |
| `2` | Erreur de configuration |
| `3` | Échec cleanup (mode `run`, backup OK) |

En cas d'échec sur une base, les bases suivantes sont quand même sauvegardées ; le code `1` est renvoyé à la fin avec la liste des échecs. Dans ce cas, `run` ne lance pas le nettoyage.

## Stratégie de rétention

Le module `cleanup.js` regroupe les fichiers `{instance}_{base}_{horodatage}.sql.gz` par base, puis supprime ceux dont le `mtime` dépasse `RETENTION_DAYS` — **sauf** les `MIN_BACKUPS_KEPT` (3 par défaut) plus récents de chaque groupe. Si les sauvegardes cessent de fonctionner, la rétention ne vide donc jamais le répertoire.

- Les fichiers hors format ne sont jamais touchés ; aucune récursion dans les sous-dossiers.
- Les sauvegardes sont écrites en `*.sql.gz.tmp` puis renommées une fois terminées (mode `0600`). Un résidu `.tmp` de plus d'un jour (crash) est supprimé au nettoyage.

## Restauration

### Test sur base de staging (recommandé)

Ne restaurez jamais directement sur la base de production sans test préalable.

1. **Vérifier l'intégrité du backup**

```bash
gzip -t /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz
```

2. **Créer une base de test**

```bash
sudo -u postgres psql -c "CREATE DATABASE myapp_restore_test;"
```

3. **Restaurer via l'application**

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js restore --file /var/backups/postgresql/default_myapp_2026-06-06_02-00-01.sql.gz --database myapp_restore_test'
```

L'option `--instance` est requise si plusieurs instances sont configurées et que le préfixe du fichier est ambigu. Sinon, l'instance est déduite du nom de fichier (`pg14_...`, `default_...`, ou format legacy `{db}_...`).

4. **Vérifier les données**

```bash
sudo -u postgres psql -d myapp_restore_test -c "\dt"
sudo -u postgres psql -d myapp_restore_test -c "SELECT COUNT(*) FROM ma_table;"
sudo -u postgres psql -d myapp -c "SELECT COUNT(*) FROM ma_table;"
```

Les counts doivent correspondre.

5. **Nettoyer**

```bash
sudo -u postgres psql -c "DROP DATABASE myapp_restore_test;"
```

> **Comportement de `restore` :** pour une base, psql s'exécute avec `ON_ERROR_STOP=1` et `--single-transaction` — tout est restauré ou rien, et la moindre erreur SQL donne un code de sortie non nul. Restaurer sur une base non vide échoue donc (objets déjà existants) : utilisez une base vide. Pour les rôles, le mode est tolérant (les rôles déjà présents, comme `postgres`, sont signalés en avertissement).

### Restaurer manuellement

```bash
gunzip -c /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz | \
  sudo -u postgres psql -d myapp_restore_test
```

### Restaurer les rôles (si `BACKUP_ROLES=true`)

Restaurer **avant** les bases :

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js restore --file /var/backups/postgresql/pg14_roles_2026-06-06_02-00-01.sql.gz --instance pg14'
```

Ou manuellement :

```bash
gunzip -c /var/backups/postgresql/roles_2026-06-06_02-00-01.sql.gz | \
  sudo -u postgres psql -f -
```

### Extensions (pgvector)

Si la base utilise l'extension `vector`, installez-la sur la base cible avant restauration si nécessaire :

```bash
sudo -u postgres psql -d myapp_restore_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Bonnes pratiques

1. Toujours tester sur une base de staging avant la production.
2. Couper les connexions actives si nécessaire avant restauration complète.
3. Restaurer les rôles avant les données.

## Dépannage

| Symptôme | Solution |
|---|---|
| `Password authentication is not supported` (GitHub) | Utiliser un PAT ou SSH, pas le mot de passe GitHub |
| `Permission denied` sur `/etc/postgresql-backup.env` | `sudo chown postgres:postgres /etc/postgresql-backup.env` + `chmod 600` |
| `node: command not found` sous `postgres` | Node installé via nvm uniquement → installer Node système (NodeSource), utiliser `/usr/bin/node` |
| `node -v` OK en root mais pas sous `postgres` | Même cause : installer Node système via NodeSource |
| `node -v` OK mais `/usr/bin/node` introuvable | `which node` pointe vers nvm → installer NodeSource, vérifier `/usr/bin/node` |
| systemd échoue avec `status=203/EXEC` | `ExecStart` pointe vers un binaire inexistant → installer Node système ou corriger vers `/usr/bin/node` |
| Node installé mais version < 18 | Mettre à jour via NodeSource `setup_22.x` |
| `pg_dump` version incompatible | Installer le client correspondant : `postgresql-client-14` |
| Binaire introuvable pour une instance | Définir `pg14_VERSION=14` ou `pg14_PG_DUMP=/chemin/pg_dump` |
| `Instance inconnue` à la restauration | Passer `--instance pg14` ou vérifier le préfixe du fichier |
| `chown: No such file or directory` | Exécuter `mkdir -p` avant `chown` |
| `database "xxx" does not exist` | Vérifier `BACKUP_DATABASES` avec `sudo -u postgres psql -l` |
| Timer actif mais pas de backup visible | `sudo systemctl start postgresql-backup.service` puis `journalctl -u postgresql-backup.service` |

## Architecture

```
systemd timer (02:00 daily)
    └── postgresql-backup.service (oneshot)
            └── node src/index.js run
                    ├── backup.js  → pg_dump / pg_dumpall → gzip
                    └── cleanup.js → suppression > 30 jours
```

## Tests

```bash
npm test                    # tests unitaires et CLI (faux binaires, aucune base requise)

# Test de bout en bout avec un vrai PostgreSQL (client psql/pg_dump requis)
PG_INTEGRATION=1 PGHOST=localhost PGUSER=postgres PGPASSWORD=... npm test
```

La CI GitHub Actions exécute la suite complète sur Node 18/20/22 avec un service PostgreSQL 14.

## Améliorations possibles

- Alertes webhook (Slack, Discord) en cas d'échec
- Format custom `pg_dump -Fc` + `pg_restore`
- Chiffrement GPG des archives
- Copie off-site (S3, rsync)
