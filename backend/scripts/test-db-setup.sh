#!/usr/bin/env bash
# Crea (si falta) la BD de tests y aplica las migraciones. Se ejecuta como
# "pretest" antes de vitest. Localiza los binarios de PostgreSQL en el PATH
# o en las instalaciones habituales de este Mac (Postgres.app / Homebrew).
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="digital_power_test"

find_createdb() {
  if command -v createdb >/dev/null 2>&1; then
    command -v createdb
    return
  fi
  local candidates=(
    /Applications/Postgres.app/Contents/Versions/*/bin/createdb
    /opt/homebrew/opt/postgresql@*/bin/createdb
    "$HOME"/homebrew/opt/postgresql@*/bin/createdb
  )
  for c in "${candidates[@]}"; do
    if [ -x "$c" ]; then
      echo "$c"
      return
    fi
  done
  echo "No se encontró createdb (ni en PATH ni en Postgres.app/Homebrew)" >&2
  return 1
}

CREATEDB="$(find_createdb)"
"$CREATEDB" "$DB_NAME" 2>/dev/null || true

set -a
source .env.test
set +a

# La URL del .env.test es la de una máquina concreta: TEST_DATABASE_URL la
# sobreescribe en otras máquinas/CI (mismo mecanismo que vitest.config.ts).
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$TEST_DATABASE_URL"
fi

npx prisma migrate deploy
