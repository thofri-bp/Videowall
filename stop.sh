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
  if docker-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    echo "Fehler: Das installierte 'docker-compose' ist nicht lauffaehig."
    echo "Bitte Docker Compose v2 installieren."
    exit 1
  fi
else
  echo "Fehler: weder 'docker compose' noch ein funktionierendes 'docker-compose' ist verfuegbar."
  echo "Bitte Docker Compose v2 installieren."
  exit 1
fi

echo "Stoppe VideoWall-Container..."
"${COMPOSE_CMD[@]}" down --remove-orphans
echo "VideoWall wurde gestoppt. Daten-Volumes bleiben erhalten."
