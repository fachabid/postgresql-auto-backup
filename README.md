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
- Node.js 18+
- Client PostgreSQL : `postgresql-client-14`

```bash
sudo apt update
sudo apt install -y postgresql-client-14 nodejs
```

## Installation sur Ubuntu

```bash
# 1. Copier le projet
sudo mkdir -p /opt/postgresql-backup
sudo cp -r . /opt/postgresql-backup/

# 2. Configurer les variables d'environnement
sudo cp /opt/postgresql-backup/.env.example /etc/postgresql-backup.env
sudo chmod 600 /etc/postgresql-backup.env
sudo nano /etc/postgresql-backup.env

# 3. Créer le répertoire de sauvegarde
sudo mkdir -p /var/backups/postgresql
sudo chown postgres:postgres /var/backups/postgresql
sudo chmod 700 /var/backups/postgresql

# 4. Activer le timer systemd
sudo cp /opt/postgresql-backup/systemd/postgresql-backup.service /etc/systemd/system/
sudo cp /opt/postgresql-backup/systemd/postgresql-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql-backup.timer
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

Copier `.env.example` vers `/etc/postgresql-backup.env` :

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `PGHOST` | non | `localhost` | Hôte PostgreSQL |
| `PGPORT` | non | `5432` | Port |
| `PGUSER` | oui | — | Utilisateur PostgreSQL |
| `PGPASSWORD` | oui* | — | Mot de passe (* ou `PGPASSFILE`) |
| `BACKUP_DATABASES` | oui | — | Bases séparées par virgule |
| `BACKUP_DIR` | non | `/var/backups/postgresql` | Répertoire de sortie |
| `RETENTION_DAYS` | non | `30` | Suppression au-delà de N jours |
| `BACKUP_ROLES` | non | `false` | Dump rôles via `pg_dumpall --roles-only` |
| `DRY_RUN` | non | `false` | Mode simulation |
| `LOG_FORMAT` | non | `text` | `text` ou `json` |
| `LOG_FILE` | non | — | Chemin fichier log optionnel |

**Sécurité :** ne jamais committer le fichier `.env`. Permissions recommandées : `chmod 600`.

## Commandes

### Backup manuel (backup + cleanup)

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js run
```

### Dry-run

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js --dry-run run
# ou
sudo -u postgres DRY_RUN=true node /opt/postgresql-backup/src/index.js run
```

### Backup seul

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js backup
```

### Cleanup seul

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js cleanup
```

### Vérifier le timer

```bash
systemctl status postgresql-backup.timer
systemctl list-timers postgresql-backup.timer
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

### Vérifier l'intégrité du backup

```bash
gzip -t /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz
```

### Restaurer une base (via l'application)

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js restore \
  --file /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz \
  --database myapp
```

### Restaurer manuellement

```bash
gunzip -c /var/backups/postgresql/myapp_2026-06-06_02-00-01.sql.gz | \
  psql -h localhost -U postgres -d myapp
```

### Restaurer les rôles (si `BACKUP_ROLES=true`)

Restaurer **avant** les bases :

```bash
sudo -u postgres node /opt/postgresql-backup/src/index.js restore \
  --file /var/backups/postgresql/roles_2026-06-06_02-00-01.sql.gz
```

Ou manuellement :

```bash
gunzip -c /var/backups/postgresql/roles_2026-06-06_02-00-01.sql.gz | \
  psql -h localhost -U postgres -f -
```

### Bonnes pratiques

1. Tester sur une base de staging (`CREATE DATABASE myapp_restore_test`).
2. Couper les connexions actives si nécessaire avant restauration complète.
3. Restaurer les rôles avant les données.

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
