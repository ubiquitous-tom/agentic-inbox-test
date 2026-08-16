// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Hono middleware to handle repetitive Mailbox Durable Object instantiation.
 * Resolves the caller's identity, checks it's allowed to access the requested
 * mailbox (their own address, or a configured shared address), lazily
 * provisions the mailbox on first authorized access, then instantiates the
 * DO stub and attaches it to the Hono context (`c.var.mailboxStub`).
 */
import { createMiddleware } from "hono/factory";
import type { MailboxDO } from "../durableObject";
import type { Env } from "../types";
import { getAuthenticatedUserEmail, IdentityError } from "./identity";
import { defaultMailboxSettings } from "./email-helpers";

export type MailboxContext = {
	Bindings: Env;
	Variables: {
		mailboxStub: DurableObjectStub<MailboxDO>;
	};
};

export const requireMailbox = createMiddleware<MailboxContext>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = decodeURIComponent(rawId).toLowerCase();

	let userEmail: string;
	try {
		userEmail = await getAuthenticatedUserEmail(c);
	} catch (e) {
		if (e instanceof IdentityError) return c.json({ error: e.message }, 403);
		throw e;
	}

	const sharedAddresses = ((c.env.SHARED_MAILBOX_ADDRESSES ?? []) as string[]).map((a) =>
		a.toLowerCase(),
	);
	const allowed = mailboxId === userEmail || sharedAddresses.includes(mailboxId);
	// Respond identically to "mailbox doesn't exist" so unauthorized callers
	// can't distinguish a real mailbox from a nonexistent one.
	if (!allowed) {
		return c.json({ error: "Not found" }, 404);
	}

	// Instantiate DO stub
	const ns = c.env.MAILBOX;
	const stub = ns.get(ns.idFromName(mailboxId));

	// Lazily provision on first authorized access, mirroring POST /api/v1/mailboxes.
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) {
		await c.env.BUCKET.put(key, JSON.stringify(defaultMailboxSettings(mailboxId.split("@")[0])));
		await stub.getFolders();
	}

	c.set("mailboxStub", stub);

	await next();
});
