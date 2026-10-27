#!/bin/sh
set -eu
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
SAMMY_TEST_DIR=$(mktemp -d /tmp/sammy-pg.XXXXXX)
trap '"$PGBIN/pg_ctl" -D "$SAMMY_TEST_DIR/data" -m immediate stop >/dev/null 2>&1 || true' EXIT
"$PGBIN/initdb" -D "$SAMMY_TEST_DIR/data" -A trust -U sammy_test >/dev/null
"$PGBIN/pg_ctl" -D "$SAMMY_TEST_DIR/data" -l "$SAMMY_TEST_DIR/postgres.log" -o "-k $SAMMY_TEST_DIR -p 55483 -c listen_addresses=''" start >/dev/null
export SAMMY_SIMULATED_PAYMENTS=true
export TEST_DATABASE_URL="postgresql://sammy_test@/postgres?host=$SAMMY_TEST_DIR&port=55483"
DATABASE_URL="$TEST_DATABASE_URL" ./node_modules/.bin/tsx scripts/migrate.ts
./node_modules/.bin/tsx --test tests/*.test.ts
