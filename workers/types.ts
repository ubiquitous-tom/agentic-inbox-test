// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	/** Dev-only: simulated authenticated user email, since Access validation is skipped in local dev. */
	DEV_USER_EMAIL: string;
	/** HMAC signing key for regular-user session cookies. Set via `wrangler secret put`. */
	SESSION_SECRET: string;
	/** The only identity allowed to reach /api/v1/admin/*. Set via `wrangler secret put`. */
	ADMIN_EMAIL: string;
	/** Forward address for mail to an unprovisioned mailbox. Set via `wrangler secret put`. */
	MASTER_NOTIFICATION_EMAIL: string;
	/** Comma-separated domain(s) this Worker sends/receives mail for. Set via `wrangler secret put`. */
	DOMAINS: string;
	/** Comma-separated allow-list restricting which addresses can be provisioned. Empty = unrestricted. Set via `wrangler secret put`. */
	EMAIL_ADDRESSES: string;
	/** Comma-separated shared/team mailbox addresses, visible to every authenticated user. Set via `wrangler secret put`. */
	SHARED_MAILBOX_ADDRESSES: string;
}
