#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Fehler: docker ist nicht installiert."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Fehler: weder 'docker compose' noch 'docker-compose' ist verfuegbar."
  exit 1
fi

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "Fehler: Bitte ADMIN_PASSWORD setzen."
  echo "Beispiel: ADMIN_PASSWORD='mein-passwort' ./deploy.sh"
  exit 1
fi

echo "Starte VideoWall-Deployment..."
"${COMPOSE_CMD[@]}" down --remove-orphans
echo "Baue Docker-Image komplett neu..."
"${COMPOSE_CMD[@]}" build --pull --no-cache
echo "Starte fertigen Container..."
"${COMPOSE_CMD[@]}" up -d --force-recreate
echo "Deployment abgeschlossen."
echo "Admin:   http://localhost:3000/admin"
echo "Display: http://localhost:3000/display"
