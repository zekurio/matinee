#!/usr/bin/env bash
# Repo-local Postgres shared by every dev shell. It listens only on a Unix
# socket in a per-checkout directory, so DATABASE_URL is static and nothing
# collides with a system-wide Postgres.
set -eu

data="$DEVSHELL_ROOT/data/postgres"
# nix/dev-shell.nix sets PGHOST to a stable per-checkout socket directory.
run="${PGHOST:?PGHOST is unset; run this from nix develop}"
db=matinee
user=postgres

ready() {
  pg_isready -h "$run" -U "$user" -d "$db" >/dev/null 2>&1
}

running() {
  [ -s "$data/postmaster.pid" ] || return 1
  pid="$(sed -n '1p' "$data/postmaster.pid")"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

start() {
  if [ -d "$DEVSHELL_ROOT/.devenv/state/matinee-postgres" ] && [ ! -d "$data" ]; then
    echo "Move the old dev database first. See 'Coming from the old devenv shell' in README.md." >&2
    exit 1
  fi
  mkdir -p "$data" "$run"
  chmod 700 "$run"

  # Serialize startup across shells. Nothing started below may inherit fd 9.
  exec 9>"$run/lock"
  if ! flock -w 30 9; then
    echo "Timed out waiting for the dev Postgres startup lock" >&2
    exit 1
  fi

  if ready; then
    return 0
  fi
  if running; then
    pg_ctl -D "$data" -w stop >/dev/null
  fi

  if [ ! -s "$data/PG_VERSION" ]; then
    initdb -D "$data" -U "$user" --auth=trust --no-locale >/dev/null 9>&-
  fi

  # No TCP listener. Close direnv's extra descriptors so Postgres cannot keep
  # `direnv export` alive.
  pg_ctl \
    -D "$data" \
    -l "$run/postgres.log" \
    -o "-c listen_addresses='' -c unix_socket_directories='$run' -c unix_socket_permissions=0700" \
    -w \
    -t 30 \
    start \
    >/dev/null \
    3>&- 4>&- 5>&- 6>&- 7>&- 8>&- 9>&-

  createdb -h "$run" -U "$user" "$db" >/dev/null 2>&1 9>&- || true
}

stop() {
  if running; then
    pg_ctl -D "$data" -w stop >/dev/null
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "usage: matinee-postgres start|stop" >&2
    exit 2
    ;;
esac
