#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/thofri-bp/Videowall.git"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Fehler: git ist nicht installiert."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Fehler: Dieses Verzeichnis ist kein Git-Repository."
  exit 1
fi

CURRENT_REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$CURRENT_REMOTE_URL" ]]; then
  echo "Fehler: Git-Remote 'origin' ist nicht gesetzt."
  echo "Bitte richte den Remote auf $REPO_URL ein."
  exit 1
fi

if [[ "$CURRENT_REMOTE_URL" != "$REPO_URL" ]]; then
  echo "Fehler: Der konfigurierte Git-Remote passt nicht zum erwarteten Repository."
  echo "Gefunden: $CURRENT_REMOTE_URL"
  echo "Erwartet: $REPO_URL"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Fehler: Konnte den aktuellen Git-Branch nicht ermitteln."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Fehler: Es gibt lokale Git-Aenderungen."
  echo "Bitte committen, stashen oder verwerfen, bevor du ein Update ziehst."
  exit 1
fi

echo "Hole neuesten Stand von GitHub..."
git fetch origin "$CURRENT_BRANCH"
echo "Aktualisiere auf origin/$CURRENT_BRANCH ..."
git pull --ff-only origin "$CURRENT_BRANCH"

echo "Starte Deployment mit dem aktualisierten Stand..."
"$ROOT_DIR/deploy.sh"
