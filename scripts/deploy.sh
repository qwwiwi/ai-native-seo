#!/usr/bin/env bash
# deploy.sh — ship build/ to blog.edgelab.space (Timeweb) AND auto-ping IndexNow.
# Before this, IndexNow was a manual afterthought (P1-4 audit gap). Now the deploy
# pings Yandex+Bing itself, so freshness is never forgotten.
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

echo "[deploy] done. Now ping Kaelthas to recrawl via Yandex.Webmaster."
