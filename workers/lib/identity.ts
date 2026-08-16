// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Resolves which authenticated user is making the current request, used to
 * scope mailbox access to that user's own address plus configured shared
 * mailboxes (see `requireMailbox` in ./mailbox.ts).
 *
 * Two independent identity sources exist: the admin reaches /api/v1/admin/*
 * via Cloudflare Access (see workers/app.ts); everyone else authenticates via
 * the session cookie issued by workers/routes/auth.ts. A request carries at
 * most one of these in practice, since Access and the cookie-based routes
 * cover disjoint paths.
 */
import type { Env } from "../types";
import { verifySession } from "./auth";

export class IdentityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IdentityError";
	}
}

/**
 * Minimal shape needed from a Hono Context — kept duck-typed rather than
 * `Context<...>` to avoid generic-variance friction across call sites that
 * carry different `Variables` types.
 */
interface RequestContext {
	req: { header(name: string): string | undefined };
	env: Env;
}

function extractCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
	if (!cookieHeader) return undefined;
	const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Resolve the authenticated user's email for the current request.
 *
 * Checks the regular-user session cookie first. Falls back to Cloudflare
 * Access: in production, Access only forwards requests to the origin after
 * enforcing its policy, and attaches this header itself — it is trusted here
 * because the JWT gate in workers/app.ts already rejects any admin request
 * that bypassed Access. In local dev, Access is skipped entirely, so
 * DEV_USER_EMAIL simulates the logged-in identity.
 */
export async function getAuthenticatedUserEmail(c: RequestContext): Promise<string> {
	const cookieValue = extractCookieValue(c.req.header("cookie"), "session");
	const sessionEmail = await verifySession(c.env, cookieValue);
	if (sessionEmail) return sessionEmail;

	if (import.meta.env.DEV) {
		const devEmail = c.env.DEV_USER_EMAIL;
		if (!devEmail) {
			throw new IdentityError("DEV_USER_EMAIL must be set in .dev.vars for local development");
		}
		return devEmail.toLowerCase();
	}

	const email = c.req.header("cf-access-authenticated-user-email");
	if (!email) {
		throw new IdentityError("Missing Cf-Access-Authenticated-User-Email header");
	}
	return email.toLowerCase();
}
