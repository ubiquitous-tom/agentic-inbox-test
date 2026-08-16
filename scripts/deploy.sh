#!/usr/bin/env bash
# Deploy this Worker to one domain-specific environment.
# Usage: scripts/deploy.sh <label>   (e.g. scripts/deploy.sh cumuluselements)
# Reads .env.deploy.<label> for that deployment's domain and plain vars.
# POLICY_AUD and SESSION_SECRET are not handled here — they're Cloudflare
# secrets, set once via `wrangler secret put` and untouched by this script.
set -euo pipefail

LABEL="${1:?Usage: scripts/deploy.sh <label>  (see .env.deploy.example)}"
ENV_FILE=".env.deploy.${LABEL}"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Missing $ENV_FILE — copy .env.deploy.example to $ENV_FILE and fill it in." >&2
	exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DEPLOY_DOMAIN:?DEPLOY_DOMAIN must be set in $ENV_FILE}"
: "${TEAM_DOMAIN:?TEAM_DOMAIN must be set in $ENV_FILE}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL must be set in $ENV_FILE}"
: "${MASTER_NOTIFICATION_EMAIL:?MASTER_NOTIFICATION_EMAIL must be set in $ENV_FILE}"
: "${DOMAINS:?DOMAINS must be set in $ENV_FILE}"

npm run build

npx wrangler deploy \
	--domain "$DEPLOY_DOMAIN" \
	--var "TEAM_DOMAIN:${TEAM_DOMAIN}" \
	--var "ADMIN_EMAIL:${ADMIN_EMAIL}" \
	--var "MASTER_NOTIFICATION_EMAIL:${MASTER_NOTIFICATION_EMAIL}" \
	--var "DOMAINS:${DOMAINS}" \
	--var "EMAIL_ADDRESSES:${EMAIL_ADDRESSES:-}" \
	--var "SHARED_MAILBOX_ADDRESSES:${SHARED_MAILBOX_ADDRESSES:-}"
