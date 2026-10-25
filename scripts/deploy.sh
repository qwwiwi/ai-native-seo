#!/usr/bin/env bash
# deploy.sh — ship build/ to the blog webroot, then tell the search engines:
# IndexNow ping (Yandex + Bing) and a Google Search Console sitemap submit.
# Order: dry-run deletion guard → backup → rsync --delete → chown → IndexNow → GSC.
#
# Usage:
#   npm run build && scripts/deploy.sh                    # deploy + IndexNow all sitemap URLs
#   scripts/deploy.sh https://blog.edgelab.space/guides/<slug>/   # ...only changed URLs
# Env: BLOG_HOST overrides the ssh target (default = Thrall reaches the public IP;
#      from Mac mini use the Tailscale address: BLOG_HOST=root@100.116.42.100).
#      BLOG_WEBROOT overrides the remote webroot — white-label deploys (M1 step 5)
#      ship ANOTHER brand's build to its own vhost dir on any host:
#        BRAND_CONFIG=brands/acme.json npm run build
#        BLOG_HOST=root@<host> BLOG_WEBROOT=/var/www/blog-acme scripts/deploy.sh
#      ALLOW_DELETE=1 lets the deploy remove prod files that are not in build/
#      (only when that deletion is planned — see the guard below).
#      GSC_SA_KEY / analytics.gscKeyPath — service-account key for the GSC submit
#      (scripts/gsc-submit-sitemap.mjs); without a key that step is skipped.
set -euo pipefail

HOST="${BLOG_HOST:-root@213.171.6.132}"
WEBROOT="${BLOG_WEBROOT:-/var/www/blog-edgelab-space}"
WEBROOT_DIR="$(dirname "$WEBROOT")"
WEBROOT_NAME="$(basename "$WEBROOT")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -o ConnectTimeout=15 "$HOST")

if [ ! -d "$ROOT/build" ]; then
  echo "[deploy] no build/ — run 'npm run build' first" >&2
  exit 1
fi

# Deletion guard (docs/DEPLOY.md «сухой прогон»): rsync --delete removes from prod
# everything that is not in build/. A build of a stale branch would silently wipe
# newer guides. Dry-run first; any *deleting line aborts unless ALLOW_DELETE=1.
echo "[deploy] dry-run: checking what --delete would remove on prod"
# fail-closed: an ssh/rsync error aborts here (set -e) instead of reading as «no deletions»
PLAN="$(rsync -azn --delete --checksum --out-format='%i %n' -e "ssh -o ConnectTimeout=15" \
  "$ROOT/build/" "$HOST:$WEBROOT/")"
DELETES="$(printf '%s\n' "$PLAN" | grep '^\*deleting' || true)"
if [ -n "$DELETES" ]; then
  echo "[deploy] rsync --delete would remove these prod files:" >&2
  echo "$DELETES" >&2
  if [ "${ALLOW_DELETE:-0}" != "1" ]; then
    echo "[deploy] ABORT: unplanned deletions. Merge main into the build / rebuild, or rerun with ALLOW_DELETE=1 if intended." >&2
    exit 1
  fi
  echo "[deploy] ALLOW_DELETE=1 — proceeding with the deletions above"
fi

TS="$(date +%Y%m%d-%H%M%S)"
# Backup is the rollback net before rsync --delete. Skip ONLY if the webroot
# doesn't exist yet (first deploy); otherwise a failed backup is FATAL — we don't
# --delete without a snapshot (Codex M345).
if "${SSH[@]}" "test -d \"$WEBROOT\""; then
  echo "[deploy] backup prod webroot → /root/$WEBROOT_NAME.bak.$TS.tgz"
  "${SSH[@]}" "tar czf \"/root/$WEBROOT_NAME.bak.$TS.tgz\" -C \"$WEBROOT_DIR\" \"$WEBROOT_NAME\""
else
  echo "[deploy] webroot $WEBROOT absent — first deploy, no backup"
fi

echo "[deploy] rsync build/ → $HOST:$WEBROOT"
rsync -az --delete -e "ssh -o ConnectTimeout=15" "$ROOT/build/" "$HOST:$WEBROOT/"
"${SSH[@]}" "chown -R www-data:www-data \"$WEBROOT\""

echo "[deploy] IndexNow ping (Yandex + Bing)"
node "$ROOT/scripts/indexnow-submit.mjs" "$@"

# Google has no IndexNow: the sitemap (honest lastmod) submitted to Search Console
# is its recrawl signal. Non-fatal: the site is already live; a missing key or a
# permission error prints the exact manual step instead of failing the deploy.
echo "[deploy] Google Search Console: submit sitemap"
node "$ROOT/scripts/gsc-submit-sitemap.mjs" || echo "[deploy] WARN: GSC sitemap submit did not complete (see the [gsc] lines above)"

echo "[deploy] done. Yandex.Webmaster recrawl of changed URLs is a separate step (docs/DEPLOY.md)."
