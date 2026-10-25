#!/usr/bin/env bash
# check.sh — the local gate before every push/deploy (no CI in this fleet).
#   scripts/check.sh            # lint + tests + build + post-build verifiers
#   scripts/check.sh --no-build # lint + tests + verifiers against the existing build/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[check] content-lint"
node scripts/content-lint.mjs

echo "[check] unit/regression tests (node:test, no network)"
npm test --silent

if [ "${1:-}" != "--no-build" ]; then
  echo "[check] build (lint-gated prerender + SEO layer)"
  npm run build --silent
fi

if [ ! -f build/sitemap.xml ]; then
  echo "[check] build/sitemap.xml missing — run without --no-build" >&2
  exit 1
fi

echo "[check] post-build verifiers"
npm run verify --silent
echo "[check] OK"
