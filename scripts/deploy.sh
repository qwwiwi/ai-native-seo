#!/usr/bin/env bash
# deploy.sh — ship build/ to the blog webroot, then tell the search engines:
# IndexNow notification (Yandex + Bing) and a Google Search Console sitemap submit.
# Order: dry-run deletion guard → backup → rsync --delete → chown → IndexNow → GSC.
#
# Usage:
#   npm run build && scripts/deploy.sh                    # deploy + IndexNow ONLY the pages whose content changed
#   scripts/deploy.sh https://<domain.site>/guides/<slug>/   # ...exactly these URLs instead
#   scripts/deploy.sh --all                               # ...every sitemap URL (explicit, use rarely)
# «Changed» = the files the dry-run below says differ from the live webroot (rsync
# --checksum, i.e. by content). The live webroot IS the previous state, so no manifest
# is stored anywhere. On a first deploy (no webroot yet) there is no previous state:
# nothing is submitted automatically and the full-submission command is printed.
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
# The same plan tells IndexNow what changed (see the header): it is only trusted when
# the webroot turns out to exist (checked below) — otherwise every file looks «new».
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
# fail-closed: «absent» must be a positive answer from the remote shell. A bare
# `test -d` exit status can't tell a missing dir (1) from an ssh error (255).
WEBROOT_RC=0
PREVIOUS_STATE_KNOWN=0
WEBROOT_STATE="$("${SSH[@]}" "if [ -d \"$WEBROOT\" ]; then echo present; elif [ -e \"$WEBROOT\" ]; then echo not-a-dir; else echo absent; fi")" || WEBROOT_RC=$?
case "$WEBROOT_RC:$WEBROOT_STATE" in
  0:present)
    PREVIOUS_STATE_KNOWN=1
    echo "[deploy] backup prod webroot → /root/$WEBROOT_NAME.bak.$TS.tgz"
    "${SSH[@]}" "tar czf \"/root/$WEBROOT_NAME.bak.$TS.tgz\" -C \"$WEBROOT_DIR\" \"$WEBROOT_NAME\""
    ;;
  0:absent)
    echo "[deploy] webroot $WEBROOT absent — first deploy, no backup"
    ;;
  *)
    echo "[deploy] ABORT: cannot check webroot $WEBROOT on $HOST (ssh exit $WEBROOT_RC, answer «$WEBROOT_STATE») — no deploy without a backup" >&2
    exit 1
    ;;
esac

echo "[deploy] rsync build/ → $HOST:$WEBROOT"
rsync -az --delete -e "ssh -o ConnectTimeout=15" "$ROOT/build/" "$HOST:$WEBROOT/"
"${SSH[@]}" "chown -R www-data:www-data \"$WEBROOT\""

# The site is live from here on: the search pings are independent and non-fatal.
# Each one's result is captured and reported, so an IndexNow error neither skips
# the GSC submit nor fails a finished deploy — but it is never silent.
echo "[deploy] IndexNow notification (Yandex + Bing): changed pages only"
INDEXNOW_RC=0
if [ "$#" -gt 0 ]; then
  # explicit URLs or --all: the caller decided, pass them through untouched
  node "$ROOT/scripts/indexnow-submit.mjs" "$@" || INDEXNOW_RC=$?
elif [ "$PREVIOUS_STATE_KNOWN" = "1" ]; then
  PLAN_FILE="$(mktemp)"
  printf '%s\n' "$PLAN" > "$PLAN_FILE"
  node "$ROOT/scripts/indexnow-submit.mjs" --rsync-plan "$PLAN_FILE" || INDEXNOW_RC=$?
  rm -f "$PLAN_FILE"
else
  echo "[deploy] no previous deploy state (first deploy) — nothing submitted automatically."
  echo "[deploy] To submit the whole site once: node scripts/indexnow-submit.mjs --all"
  node "$ROOT/scripts/indexnow-submit.mjs" || INDEXNOW_RC=$?
fi

# Google has no IndexNow: the sitemap (honest lastmod) submitted to Search Console
# is its recrawl signal. A missing key or a permission error prints the exact
# manual step instead of failing the deploy.
echo "[deploy] Google Search Console: submit sitemap"
GSC_RC=0
node "$ROOT/scripts/gsc-submit-sitemap.mjs" || GSC_RC=$?

case "$INDEXNOW_RC" in
  0) echo "[deploy] IndexNow: OK (a notification, not a guarantee of indexing)" ;;
  75) echo "[deploy] WARN: IndexNow is rate-limited (HTTP 429, exit 75) — wait the Retry-After time printed above, then rerun scripts/indexnow-submit.mjs with the changed URLs" >&2 ;;
  *) echo "[deploy] WARN: IndexNow notification did not complete (exit $INDEXNOW_RC, see the lines above) — rerun scripts/indexnow-submit.mjs" >&2 ;;
esac
case "$GSC_RC" in
  0) echo "[deploy] GSC: OK" ;;
  2) echo "[deploy] GSC submit skipped (no analytics.gscProperty / service-account key configured)" ;;
  *) echo "[deploy] WARN: GSC sitemap submit did not complete (exit $GSC_RC, see the [gsc] lines above)" >&2 ;;
esac

echo "[deploy] done. Yandex.Webmaster recrawl of changed URLs is a separate step (docs/DEPLOY.md)."
