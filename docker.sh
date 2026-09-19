#!/bin/sh
set -eu

MODE=${1:-}
BACKUP_FILE=${2:-}

case "$MODE" in
  ""|--first-install)
    ;;
  --backup)
    if [ -z "$BACKUP_FILE" ]; then
      echo "Usage: ./docker.sh --backup /absolute/path/to/verified-backup.zip" >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: ./docker.sh [--first-install | --backup /absolute/path/to/verified-backup.zip]" >&2
    exit 1
    ;;
esac

SERVICE_NAME=${BACKEND_SERVICE_NAME:-backend}
REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=${DEPLOY_DIR:-$(dirname "$REPO_DIR")}

if [ ! -f "$DEPLOY_DIR/compose.yml" ] && [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
  echo "Production Compose file not found in $DEPLOY_DIR." >&2
  exit 1
fi

cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "Backend checkout is dirty; refusing to pull or deploy." >&2
  git status --short
  exit 1
fi

OLD_REVISION=$(git rev-parse HEAD)
git pull --ff-only
NEW_REVISION=$(git rev-parse HEAD)

MIGRATIONS_CHANGED=0
if ! git diff --quiet "$OLD_REVISION" "$NEW_REVISION" -- pb_migrations; then
  MIGRATIONS_CHANGED=1
fi

if [ "$MIGRATIONS_CHANGED" -eq 1 ] && [ "$MODE" != "--first-install" ]; then
  if [ "$MODE" != "--backup" ]; then
    echo "PocketBase migrations changed. A fresh verified backup is required." >&2
    exit 1
  fi
  if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    echo "Verified backup does not exist or is empty: $BACKUP_FILE" >&2
    exit 1
  fi
  python3 -c 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); sys.exit(1 if bad else 0)' "$BACKUP_FILE"
fi

cd "$DEPLOY_DIR"
docker compose config --quiet
if ! docker compose config --services | grep -qx "$SERVICE_NAME"; then
  echo "Compose service not found: $SERVICE_NAME" >&2
  exit 1
fi

docker compose build "$SERVICE_NAME"
docker compose up -d "$SERVICE_NAME"

attempt=1
while [ "$attempt" -le 45 ]; do
  if docker compose exec -T "$SERVICE_NAME" wget -q --spider \
    http://127.0.0.1:8080/api/v1/health; then
    docker compose ps "$SERVICE_NAME"
    echo "Backend is healthy."
    exit 0
  fi
  sleep 2
  attempt=$((attempt + 1))
done

echo "Backend did not become healthy within 90 seconds." >&2
docker compose logs --tail=150 "$SERVICE_NAME"
exit 1
