#!/usr/bin/env bash
# UAT DB Reset — backup current DB and create a clean one for UAT sessions.
# Usage: ./scripts/uat-reset-db.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${OPENSELF_DB_PATH:-$REPO_ROOT/db/openself.db}"

# Safety: refuse to run if any DB file is still held open
for f in "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"; do
  if [ -f "$f" ] && lsof "$f" 2>/dev/null | grep -q .; then
    echo "ERROR: $f is still open by another process. Stop the dev server first."
    exit 1
  fi
done

if [ -f "$DB_PATH" ]; then
  TIMESTAMP=$(date +%s)
  BACKUP="${DB_PATH}.bak-$TIMESTAMP"
  # WAL-safe backup: copy all three files together
  cp "$DB_PATH" "$BACKUP"
  [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${BACKUP}-wal"
  [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${BACKUP}-shm"
  echo "Backed up to $BACKUP (+ WAL/SHM if present)"
fi

# Remove DB + WAL/SHM files
rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
echo "Removed $DB_PATH (+ WAL/SHM) — next server start will run migrations on a fresh DB."
echo "Start the dev server to initialize a fresh database."
