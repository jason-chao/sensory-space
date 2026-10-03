#!/bin/bash
# Build the public version and upload it to Cloudflare Pages.
# Needs a one-time `npx wrangler login`. The public build has the Input tab off.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
VITE_FEATURE_INPUT=0 BASE_PATH=/ npx vite build
npx wrangler pages deploy dist --project-name sensory-space --branch main --commit-dirty=true
