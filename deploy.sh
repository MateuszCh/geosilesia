#!/bin/sh
# Build first, restart second – the new server expects the new build. The restart also
# clears every in-memory cache (rendered HTML, page list, CSR shell).
set -eu
cd "$(dirname "$0")"
# Domain under which the app is registered on MyDevil (`devil www list`). Checked before
# building, so a missing entry does not leave a new build running on the old server.
domain=$(node -p "require('./config.json').deployDomain || ''")
if [ -z "$domain" ]; then
    echo 'deploy: "deployDomain" is missing in config.json' >&2
    exit 1
fi
(cd front && npm run build:deploy)
devil www restart "$domain"
