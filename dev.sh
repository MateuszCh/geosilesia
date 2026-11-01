#!/bin/sh
# Local development (`npm run dev`): both watchers in one terminal – the development build of
# the front end (`npm run watch` in front/) and the backend on :3000 (`npm run watch` in the
# root), which nodemon restarts after every build. Ctrl+C stops both; so does either one
# exiting.
set -eu
cd "$(dirname "$0")"

# Job control: each watcher runs in its own process group, so the whole group – npm, ng or
# nodemon and the node process under it – can be stopped at once.
set -m

(cd front && exec npm run watch) &
front=$!
npm run watch &
back=$!

stop() {
    trap - INT TERM EXIT
    kill -TERM -- "-$front" "-$back" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap stop INT TERM EXIT

# Until the first build lands nodemon serves the previous one in front/dist, if there is any.
while kill -0 "$front" 2>/dev/null && kill -0 "$back" 2>/dev/null; do
    sleep 1
done
