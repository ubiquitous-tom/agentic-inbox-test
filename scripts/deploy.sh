#!/usr/bin/env bash
# Deploy this Worker to one domain-specific environment.
# Usage: scripts/deploy.sh <label>   (e.g. scripts/deploy.sh cumuluselements)
# Reads .env.deploy.<label> for that deployment's domain and plain vars.
# POLICY_AUD and SESSION_SECRET are not handled here — they're Cloudflare
# secrets, set once via `wrangler secret put` (add `--env <label>` yourself
# if WRANGLER_ENV is set below) and untouched by this script.
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

# WRANGLER_ENV selects a named `env.<name>` block in wrangler.jsonc, which is
# how a second (or third...) domain gets its own Worker name and R2 bucket
# instead of overwriting the first deployment. Leave it unset/empty for your
# first/default domain (no named environment needed). See README.md ->
# "Deploying to another domain".
WRANGLER_ENV_ARGS=()
if [[ -n "${WRANGLER_ENV:-}" ]]; then
	WRANGLER_ENV_ARGS=(--env "$WRANGLER_ENV")
fi

npm run build

npx wrangler deploy \
	"${WRANGLER_ENV_ARGS[@]}" \
	--domain "$DEPLOY_DOMAIN" \
	--var "TEAM_DOMAIN:${TEAM_DOMAIN}" \
	--var "ADMIN_EMAIL:${ADMIN_EMAIL}" \
	--var "MASTER_NOTIFICATION_EMAIL:${MASTER_NOTIFICATION_EMAIL}" \
	--var "DOMAINS:${DOMAINS}" \
	--var "EMAIL_ADDRESSES:${EMAIL_ADDRESSES:-}" \
	--var "SHARED_MAILBOX_ADDRESSES:${SHARED_MAILBOX_ADDRESSES:-}"
