# postgresql-backup

Application Node.js pour automatiser les sauvegardes PostgreSQL 14 sur Ubuntu via `pg_dump`, avec compression gzip, rétention configurable et intégration systemd.

## Fonctionnalités

- Sauvegarde journalière planifiée par **systemd timer**
- Fichiers horodatés : `{dbname}_YYYY-MM-DD_HH-mm-ss.sql.gz`
- Compression gzip en streaming (sans fichier temporaire)
- Suppression automatique des backups de plus de 30 jours (configurable)
- Support multi-bases (`BACKUP_DATABASES`)
- Option sauvegarde des rôles (`BACKUP_ROLES=true`)
- Mode dry-run
- Commande de restauration intégrée
- Zéro dépendance npm externe

## Prérequis

- Ubuntu avec PostgreSQL 14
- Node.js 18+ (ex. `/usr/bin/node` via apt ou NodeSource)
- Client PostgreSQL : `postgresql-client-14`

```bash
sudo apt update
sudo apt install -y postgresql-client-14 nodejs

# Vérifier
/usr/bin/node -v
pg_dump --version
```

## Installation sur Ubuntu

### Option A — GitHub (recommandé)

```bash
sudo git clone https://github.com/chabid19/postgresql-backup.git /opt/postgresql-backup
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

Lister les bases disponibles avant de configurer :

```bash
sudo -u postgres psql -l
```

Exemple :

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
pgbackup restore --file /var/backups/postgresql/myapp_DATE.sql.gz --database myapp_restore_test
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

## Stratégie de rétention

Le module `cleanup.js` parcourt `BACKUP_DIR`, ne traite que les fichiers `*.sql.gz`, compare leur `mtime` à `RETENTION_DAYS` et supprime les fichiers expirés. Aucune récursion dans les sous-dossiers.

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
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js restore --file /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz --database myapp_restore_test'
```

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

### Restaurer manuellement

```bash
gunzip -c /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz | \
  sudo -u postgres psql -d myapp_restore_test
```

### Restaurer les rôles (si `BACKUP_ROLES=true`)

Restaurer **avant** les bases :

```bash
sudo -u postgres bash -c 'set -a; source /etc/postgresql-backup.env; set +a; /usr/bin/node /opt/postgresql-backup/src/index.js restore --file /var/backups/postgresql/roles_2026-06-06_02-00-01.sql.gz'
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
| `node: command not found` sous `postgres` | Utiliser `/usr/bin/node` ; vérifier avec `which node` |
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

## Améliorations possibles

- Alertes webhook (Slack, Discord) en cas d'échec
- Format custom `pg_dump -Fc` + `pg_restore`
- Chiffrement GPG des archives
- Copie off-site (S3, rsync)
- Tests automatisés avec mock de `spawn`
