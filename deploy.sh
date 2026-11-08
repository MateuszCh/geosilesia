#!/bin/sh
# Run on the server (`npm run deploy`): pulls the code, builds, restarts. Build first, restart
# second – the new server expects the new build. The restart also clears every in-memory
# cache (rendered HTML, page list, CSR shell).
set -eu
cd "$(dirname "$0")"

# The pull may change this very script, so after it the new version runs from the start.
# --ff-only: the server clone never makes commits of its own, a diverged branch stops here.
if [ -z "${DEPLOY_PULLED:-}" ]; then
    git pull --ff-only
    DEPLOY_PULLED=1 exec sh "./$(basename "$0")" "$@"
fi

# Domain under which the app is registered on MyDevil (`devil www list`). Checked before
# building, so a missing entry does not leave a new build running on the old server.
domain=$(node -p "require('./config.json').deployDomain || ''")
if [ -z "$domain" ]; then
    echo 'deploy: "deployDomain" is missing in config.json' >&2
    exit 1
fi

# Server dependencies too: without a newly added one the restarted app would not start.
# npm ci installs exactly what package-lock.json pins, the versions tested locally; npm
# install kept an Express 4.16 the server once got, which has no express.text.
if git ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
    npm ci --omit=dev
else
    echo 'deploy: package-lock.json is not in the repository, npm install may keep other versions' >&2
    npm install --omit=dev
fi
# Exactly what front/package-lock.json pins (see "Build and deployment" in README.md).
(cd front && npm ci)

# The running server serves front/dist/geosilesia and keeps the SSR bundle it imported, so
# the build goes to tmp/ and replaces it only once it has succeeded: a failed or hung build
# leaves the current site in place, and until the restart the old pages still find their
# old scripts. With a plain path for --output-path the build lands in its browser/ and
# server/ folders.
rm -rf tmp/front-build tmp/front-old
(cd front && npm run build -- --output-path ../tmp/front-build)
mkdir -p front/dist
if [ -d front/dist/geosilesia ]; then
    mv front/dist/geosilesia tmp/front-old
fi
mv tmp/front-build front/dist/geosilesia
rm -rf tmp/front-old

devil www restart "$domain"
