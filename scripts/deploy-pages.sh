#!/bin/bash
# Build the public version and upload it to Cloudflare Pages.
# Needs a one-time `npx wrangler login`. The public build has the Input tab off and the
# usage counter on; the counter only attaches itself on the public host names (src/analytics.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
VITE_FEATURE_INPUT=0 BASE_PATH=/ \
  VITE_ANALYTICS_SRC=https://stats.example/script.js \
  VITE_ANALYTICS_ID=your-site-id \
  npx vite build
npx wrangler pages deploy dist --project-name sensory-space --branch main --commit-dirty=true
