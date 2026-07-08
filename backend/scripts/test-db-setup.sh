#!/usr/bin/env bash
# Crea (si falta) la BD de tests y aplica las migraciones. Se ejecuta como
# "pretest" antes de vitest. Usa el PostgreSQL 16 de Homebrew de este Mac
# (no está en el PATH estándar, ver CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="$HOME/homebrew/opt/postgresql@16/bin"
DB_NAME="digital_power_test"

"$PG_BIN/createdb" "$DB_NAME" 2>/dev/null || true

set -a
source .env.test
set +a

npx prisma migrate deploy
