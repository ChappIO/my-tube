#!/bin/sh
# Runs the app as the mytube user, remapped to PUID/PGID (linuxserver convention),
# so files written to the mounts are owned by the host user. Only /config is
# chowned: media libraries can be huge and belong to whoever mounted them.
set -eu

if [ "$(id -u)" = "0" ]; then
  groupmod -o -g "${PGID:-1000}" mytube
  usermod -o -u "${PUID:-1000}" mytube
  chown -R mytube:mytube /config
  exec gosu mytube "$@"
fi

exec "$@"
