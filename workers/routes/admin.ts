// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Admin-only routes: list every mailbox and provision new ones. Reached only
 * through Cloudflare Access (see workers/app.ts), and additionally checked
 * against ADMIN_EMAIL here so a future Access policy change can't silently
 * widen who can administer mailboxes.
 */
import type { Context } from "hono";
import { z } from "zod";
import { sendEmail } from "../email-sender";
import { defaultMailboxSettings, listMailboxes, type MailboxSettings } from "../lib/email-helpers";
import { generateToken } from "../lib/auth";
import { getAuthenticatedUserEmail, IdentityError } from "../lib/identity";
import { readMailboxSettings, sendPasswordResetLink } from "./auth";
import type { Env } from "../types";

type AppContext = Context<{ Bindings: Env }>;

const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CreateAdminMailboxBody = z.object({
	email: z.string().email(),
	recoveryEmail: z.string().email(),
	name: z.string().min(1).optional(),
});

const ChangeRecoveryEmailBody = z.object({
	recoveryEmail: z.string().email(),
});

async function requireAdmin(c: AppContext): Promise<string | null> {
	let email: string;
	try {
		email = await getAuthenticatedUserEmail(c);
	} catch (e) {
		if (e instanceof IdentityError) return null;
		throw e;
	}
	return email === c.env.ADMIN_EMAIL.toLowerCase() ? email : null;
}

export async function handleListAllMailboxes(c: AppContext) {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);

	const mailboxes = await listMailboxes(c.env.BUCKET);
	const withStatus = await Promise.all(
		mailboxes.map(async (m) => {
			const obj = await c.env.BUCKET.get(`mailboxes/${m.id}.json`);
			const settings = (await obj?.json()) as MailboxSettings | undefined;
			return {
				id: m.id,
				email: m.email,
				recoveryEmail: settings?.auth?.recoveryEmail ?? null,
				activated: !!settings?.auth?.passwordHash,
			};
		}),
	);
	return c.json(withStatus);
}

export async function handleCreateAdminMailbox(c: AppContext) {
	const adminEmail = await requireAdmin(c);
	if (!adminEmail) return c.json({ error: "Forbidden" }, 403);

	const { email: rawEmail, recoveryEmail, name } = CreateAdminMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const key = `mailboxes/${email}.json`;

	// Allow provisioning a password onto a mailbox that already exists (e.g. one
	// created before this login system, or auto-provisioned via Access) — but
	// never overwrite one that's already activated.
	const existingObj = await c.env.BUCKET.get(key);
	const existing = (await existingObj?.json()) as MailboxSettings | undefined;
	if (existing?.auth?.passwordHash) {
		return c.json({ error: "Mailbox already has a password set" }, 409);
	}

	const token = generateToken();
	const settings: MailboxSettings = {
		...(existing ?? defaultMailboxSettings(name || email.split("@")[0])),
		...(name ? { fromName: name } : {}),
		auth: {
			recoveryEmail: recoveryEmail.toLowerCase(),
			passwordHash: null,
			pendingToken: token,
			pendingTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS).toISOString(),
		},
	};
	await c.env.BUCKET.put(key, JSON.stringify(settings));

	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();

	const activationUrl = new URL(`/activate?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`, c.req.url);
	await sendEmail(c.env.EMAIL, {
		to: recoveryEmail,
		from: `noreply@${c.env.DOMAINS.split(",")[0].trim()}`,
		subject: `Activate your ${email} mailbox`,
		html: `<p>An account was created for you at <strong>${email}</strong>.</p><p><a href="${activationUrl.toString()}">Click here to set your password and activate it</a>.</p><p>This link expires in 24 hours.</p>`,
		text: `An account was created for you at ${email}.\n\nActivate it here: ${activationUrl.toString()}\n\nThis link expires in 24 hours.`,
	});

	return c.json({ id: email, email, recoveryEmail: recoveryEmail.toLowerCase(), activated: false }, 201);
}

/**
 * Remove a mailbox's account record — either a pending invite nobody
 * activated, or a fully active mailbox the admin is deliberately deleting.
 * Only removes the R2 settings/auth record; the underlying Durable Object
 * mail data isn't purged (matches the existing DELETE /api/v1/mailboxes
 * behavior — full cleanup was never implemented there either).
 */
export async function handleDeleteMailbox(c: AppContext) {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);

	const email = decodeURIComponent(c.req.param("email") ?? "").toLowerCase();
	const key = `mailboxes/${email}.json`;
	const settings = await readMailboxSettings(c.env, email);
	if (!settings) return c.json({ error: "Not found" }, 404);

	await c.env.BUCKET.delete(key);
	return c.body(null, 204);
}

/**
 * Admin-triggered password reset — sends a fresh reset link to whichever
 * recovery email is currently on file, using the same flow as self-service
 * "forgot password". Old password stays valid until the link is used.
 */
export async function handleAdminResetPassword(c: AppContext) {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);

	const email = decodeURIComponent(c.req.param("email") ?? "").toLowerCase();
	const settings = await readMailboxSettings(c.env, email);
	if (!settings?.auth) return c.json({ error: "Not found" }, 404);

	await sendPasswordResetLink(c.env, c.req.url, email, settings);
	return c.json({ status: "ok" });
}

/**
 * Update the recovery email on file for a mailbox — e.g. the user lost
 * access to their old one. Admin-only, no verification loop: this account
 * is already trusted to administer mailboxes directly.
 */
export async function handleChangeRecoveryEmail(c: AppContext) {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);

	const email = decodeURIComponent(c.req.param("email") ?? "").toLowerCase();
	const { recoveryEmail } = ChangeRecoveryEmailBody.parse(await c.req.json());
	const key = `mailboxes/${email}.json`;
	const settings = await readMailboxSettings(c.env, email);
	if (!settings?.auth) return c.json({ error: "Not found" }, 404);

	const updated: MailboxSettings = {
		...settings,
		auth: { ...settings.auth, recoveryEmail: recoveryEmail.toLowerCase() },
	};
	await c.env.BUCKET.put(key, JSON.stringify(updated));
	return c.json({ id: email, recoveryEmail: recoveryEmail.toLowerCase() });
}
