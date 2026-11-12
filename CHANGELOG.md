# Changelog

## 2.0.0

### Ajouté
- Mode multi-instances (`PG_INSTANCES`) avec binaires `pg_dump`/`psql` par version.
- Rétention de sécurité `MIN_BACKUPS_KEPT` : les N sauvegardes les plus récentes de chaque base ne sont jamais supprimées.
- Suite de tests (`npm test`, `node:test`, zéro dépendance) et test de bout en bout contre un vrai PostgreSQL.
- Intégration continue GitHub Actions (Node 18/20/22 avec PostgreSQL 14, et PostgreSQL 16).

### Corrigé
- Une base en échec n'interrompt plus la sauvegarde des suivantes ; les échecs sont agrégés (code de sortie 1).
- `restore` utilise `ON_ERROR_STOP=1` et `--single-transaction` : une erreur SQL donne un code de sortie non nul au lieu d'un faux succès.
- Détection des dumps de rôles (`roles_*` et `<instance>_roles_*`).
- Le log fichier ne perd plus ses dernières lignes à la sortie du processus.
- Les sauvegardes sont écrites en `.tmp` puis renommées (jamais de fichier partiel), en mode `0600`.
- `--help` fonctionne ; une option sans valeur est refusée.
- En multi-instances, `PG_DUMP`/`PG_DUMPALL`/`PSQL` globaux servent de repli.

### Changé
- Les fichiers de sauvegarde sont préfixés par l'instance : `{instance}_{base}_{horodatage}.sql.gz` (`default_` en mode simple). Les anciens fichiers `{base}_{horodatage}.sql.gz` restent restaurables.

## 1.0.0
- Version initiale : `pg_dump` + gzip, systemd timer, rétention, restauration.
