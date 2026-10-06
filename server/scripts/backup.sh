#!/bin/sh
# Sauvegarde quotidienne : dump SQL + assets.
#
#   0 3 * * * /home/debian/placekeepr/server/scripts/backup.sh >> /home/debian/backups/placekeepr.log 2>&1
#
# ⚠️ Ce que cette sauvegarde protège, et ce qu'elle ne protège pas.
# Elle couvre les vraies causes de perte du quotidien : mauvaise migration,
# table vidée, volume Docker supprimé par erreur. Elle est sur le MÊME disque
# que les données : elle ne couvre donc PAS une panne du disque du VPS. Pour
# ça, il faut une copie hors machine.
#
# Les assets sont la seule donnée non reconstructible du système : `mints`,
# `places` et `likes` se rejouent depuis la chaîne via l'indexer Helius, les
# photos non. Ce sont elles, les preuves.
#
# Une sauvegarde jamais restaurée n'est pas une sauvegarde : teste la
# restauration une fois, pour de vrai.
set -eu

STACK="${STACK_DIR:-/home/debian/placekeepr/server}"
DEST="${BACKUP_DIR:-/home/debian/backups/placekeepr}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP=$(date -u +%Y-%m-%dT%H%M)

mkdir -p "$DEST"

# `pg_dump` dans le conteneur, sortie compressée côté hôte.
docker compose -f "$STACK/docker-compose.yml" exec -T db \
  pg_dump -U placekeepr -d placekeepr --no-owner \
  | gzip > "$DEST/db-$STAMP.sql.gz"

# Les assets vivent dans un volume nommé : on passe par un conteneur jetable.
# `--user` : sans ça l'archive sort en root:root dans un répertoire utilisateur.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v placekeepr_assets:/assets:ro \
  -v "$DEST":/backup \
  alpine tar czf "/backup/assets-$STAMP.tar.gz" -C /assets .

find "$DEST" -name '*.gz' -mtime "+$KEEP_DAYS" -delete

echo "$(date -u +%FT%TZ) OK  db=$(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1)  assets=$(du -h "$DEST/assets-$STAMP.tar.gz" | cut -f1)"
