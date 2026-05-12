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

DATA_VOLUME_NAME="videowall_data"

echo "Starte VideoWall-Deployment..."
"${COMPOSE_CMD[@]}" down --remove-orphans
echo "Baue Docker-Image komplett neu..."
"${COMPOSE_CMD[@]}" build --pull --no-cache

if ! docker volume inspect "$DATA_VOLUME_NAME" >/dev/null 2>&1; then
  echo "Erstelle Docker-Volume fuer persistente Daten..."
  docker volume create "$DATA_VOLUME_NAME" >/dev/null
fi

if [[ -d "$ROOT_DIR/data" ]] && [[ -n "$(find "$ROOT_DIR/data" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "Pruefe vorhandene lokale Daten fuer eine einmalige Migration ins Docker-Volume..."
  docker run --rm \
    -v "$DATA_VOLUME_NAME:/to" \
    -v "$ROOT_DIR/data:/from:ro" \
    videowall \
    sh -lc 'if [ -z "$(find /to -mindepth 1 -print -quit 2>/dev/null)" ] && [ -n "$(find /from -mindepth 1 -print -quit 2>/dev/null)" ]; then cp -a /from/. /to/; echo "Lokale Daten wurden ins Docker-Volume migriert."; else echo "Keine Migration noetig."; fi'
fi

echo "Starte fertigen Container..."
"${COMPOSE_CMD[@]}" up -d --force-recreate
echo "Deployment abgeschlossen."
HOST_PORT="${HOST_PORT:-80}"
echo "Admin:   http://localhost:${HOST_PORT}/admin"
echo "Display: http://localhost:${HOST_PORT}/display"
