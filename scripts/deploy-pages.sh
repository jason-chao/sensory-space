#!/bin/bash
# Manual fallback for the GitHub workflow (.github/workflows/deploy.yml), which normally
# deploys every push to main. Builds the public version and uploads it to Cloudflare Pages.
# Needs a one-time `npx wrangler login`. The usage-counter address and id come from the
# environment or from deploy.local/pages.env (not in the repository), as in the workflow's variables. The public build has the Input tab off and the
# usage counter on; the counter only attaches itself on the public host names (src/analytics.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
[ -f deploy.local/pages.env ] && set -a && . deploy.local/pages.env && set +a
: "${ANALYTICS_SRC:?set ANALYTICS_SRC, or create deploy.local/pages.env}"
: "${ANALYTICS_ID:?set ANALYTICS_ID, or create deploy.local/pages.env}"
VITE_FEATURE_INPUT=0 BASE_PATH=/ VITE_ANALYTICS_SRC="$ANALYTICS_SRC" VITE_ANALYTICS_ID="$ANALYTICS_ID" \
  npx vite build
npx wrangler pages deploy dist --project-name sensory-space --branch main --commit-dirty=true
