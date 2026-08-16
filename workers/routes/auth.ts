// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Regular-user auth routes: activate an admin-provisioned mailbox, log in,
 * reset a forgotten password, and log out. Independent of Cloudflare Access —
 * see workers/lib/identity.ts for how the two identity sources combine.
 */
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { sendEmail } from "../email-sender";
import { generateToken, hashPassword, signSession, verifyPassword, SESSION_DURATION_SECONDS } from "../lib/auth";
import type { MailboxSettings } from "../lib/email-helpers";
import type { Env } from "../types";

type AppContext = Context<{ Bindings: Env }>;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const ActivateBody = z.object({ email: z.string().email(), token: z.string().min(1), password: z.string().min(8) });
const RequestResetBody = z.object({ email: z.string().email() });
const ResetPasswordBody = z.object({ email: z.string().email(), token: z.string().min(1), password: z.string().min(8) });

export async function readMailboxSettings(env: Env, email: string): Promise<MailboxSettings | null> {
	const obj = await env.BUCKET.get(`mailboxes/${email}.json`);
	if (!obj) return null;
	return (await obj.json()) as MailboxSettings;
}

/**
 * Generate a fresh reset token for a mailbox and email it to the recovery
 * address on file. Shared by the self-service "forgot password" flow and the
 * admin-triggered reset (see workers/routes/admin.ts).
 */
export async function sendPasswordResetLink(
	env: Env,
	requestUrl: string,
	email: string,
	settings: MailboxSettings,
): Promise<void> {
	if (!settings.auth?.recoveryEmail) return;

	const token = generateToken();
	const updated: MailboxSettings = {
		...settings,
		auth: {
			...settings.auth,
			pendingToken: token,
			pendingTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
		},
	};
	await env.BUCKET.put(`mailboxes/${email}.json`, JSON.stringify(updated));

	const resetUrl = new URL(`/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`, requestUrl);
	await sendEmail(env.EMAIL, {
		to: settings.auth.recoveryEmail,
		from: `noreply@${env.DOMAINS.split(",")[0].trim()}`,
		subject: `Reset your ${email} mailbox password`,
		html: `<p><a href="${resetUrl.toString()}">Click here to set a new password</a> for ${email}.</p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
		text: `Reset your password for ${email}: ${resetUrl.toString()}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
	});
}

async function setSessionCookie(c: AppContext, email: string) {
	const value = await signSession(c.env, email);
	setCookie(c, "session", value, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_DURATION_SECONDS,
	});
}

export async function handleLogin(c: AppContext) {
	const { email: rawEmail, password } = LoginBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const settings = await readMailboxSettings(c.env, email);
	const hash = settings?.auth?.passwordHash;
	if (!hash || !(await verifyPassword(password, hash))) {
		return c.json({ error: "Invalid email or password" }, 401);
	}
	await setSessionCookie(c, email);
	return c.json({ email });
}

export async function handleActivate(c: AppContext) {
	const { email: rawEmail, token, password } = ActivateBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const key = `mailboxes/${email}.json`;
	const settings = await readMailboxSettings(c.env, email);
	const auth = settings?.auth;
	if (
		!settings ||
		!auth?.pendingToken ||
		auth.pendingToken !== token ||
		!auth.pendingTokenExpiresAt ||
		Date.parse(auth.pendingTokenExpiresAt) < Date.now()
	) {
		return c.json({ error: "Invalid or expired activation link" }, 400);
	}

	const updated: MailboxSettings = {
		...settings,
		auth: { ...auth, passwordHash: await hashPassword(password), pendingToken: null, pendingTokenExpiresAt: null },
	};
	await c.env.BUCKET.put(key, JSON.stringify(updated));
	await setSessionCookie(c, email);
	return c.json({ email });
}

export async function handleRequestPasswordReset(c: AppContext) {
	const { email: rawEmail } = RequestResetBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const settings = await readMailboxSettings(c.env, email);

	// Always respond the same way regardless of whether the mailbox exists,
	// so this endpoint can't be used to enumerate valid addresses.
	if (settings) {
		await sendPasswordResetLink(c.env, c.req.url, email, settings);
	}

	return c.json({ status: "ok" });
}

export async function handleResetPassword(c: AppContext) {
	const { email: rawEmail, token, password } = ResetPasswordBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const key = `mailboxes/${email}.json`;
	const settings = await readMailboxSettings(c.env, email);
	const auth = settings?.auth;
	if (
		!settings ||
		!auth?.pendingToken ||
		auth.pendingToken !== token ||
		!auth.pendingTokenExpiresAt ||
		Date.parse(auth.pendingTokenExpiresAt) < Date.now()
	) {
		return c.json({ error: "Invalid or expired reset link" }, 400);
	}

	const updated: MailboxSettings = {
		...settings,
		auth: { ...auth, passwordHash: await hashPassword(password), pendingToken: null, pendingTokenExpiresAt: null },
	};
	await c.env.BUCKET.put(key, JSON.stringify(updated));
	await setSessionCookie(c, email);
	return c.json({ email });
}

export async function handleLogout(c: AppContext) {
	deleteCookie(c, "session", { path: "/" });
	return c.body(null, 204);
}
