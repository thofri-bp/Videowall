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
    echo "Ursache ist oft Docker Compose v1 mit Python 3.12 ('No module named distutils')."
    echo "Bitte Docker Compose v2 installieren und danach erneut starten."
    echo "Beispiel fuer Debian/Ubuntu: apt-get update && apt-get install -y docker-compose-plugin"
    exit 1
  fi
else
  echo "Fehler: weder 'docker compose' noch ein funktionierendes 'docker-compose' ist verfuegbar."
  echo "Bitte Docker Compose v2 installieren."
  exit 1
fi

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "Hinweis: ADMIN_PASSWORD ist nicht gesetzt."
  echo "Bei einer Erstinstallation wird dann das Standardpasswort 'videowall-admin' gespeichert."
  echo "Bei bestehenden Installationen bleibt das bereits gespeicherte Passwort erhalten."
fi

DATA_VOLUME_DEFAULT_NAME="videowall_data"

detect_existing_data_volume() {
  local volume_name

  if docker volume inspect "$DATA_VOLUME_DEFAULT_NAME" >/dev/null 2>&1; then
    echo "$DATA_VOLUME_DEFAULT_NAME"
    return
  fi

  while IFS= read -r volume_name; do
    if [[ "$volume_name" == *_videowall_data ]]; then
      echo "$volume_name"
      return
    fi
  done < <(docker volume ls --format '{{.Name}}')

  echo "$DATA_VOLUME_DEFAULT_NAME"
}

DATA_VOLUME_NAME="${DATA_VOLUME_NAME:-$(detect_existing_data_volume)}"
export DATA_VOLUME_NAME

if [[ "$DATA_VOLUME_NAME" != "$DATA_VOLUME_DEFAULT_NAME" ]]; then
  echo "Verwende bestehendes Daten-Volume aus einer älteren Version: $DATA_VOLUME_NAME"
fi

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
