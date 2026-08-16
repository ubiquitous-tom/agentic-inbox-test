// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Password hashing, random token generation, and signed session tokens for
 * the non-Access user login flow (activation, login, password reset).
 * Admin routes keep using Cloudflare Access; this is only for regular users.
 */
import type { Env } from "../types";

const PBKDF2_ITERATIONS = 100_000;
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** One-way PBKDF2 hash — the raw password is never recoverable from the stored value. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = Number(parts[1]);
	const salt = fromBase64Url(parts[2]);
	const expected = toBase64Url(fromBase64Url(parts[3]));
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
	return timingSafeEqual(toBase64Url(new Uint8Array(bits)), expected);
}

/** Random token used for both activation links and password-reset links. */
export function generateToken(): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function hmac(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return toBase64Url(new Uint8Array(sig));
}

/** Sign a session token (email + expiry) for a regular (non-Access) user. Returns the cookie value. */
export async function signSession(env: Env, email: string): Promise<string> {
	const payload = toBase64Url(
		new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + SESSION_DURATION_SECONDS * 1000 })),
	);
	const sig = await hmac(env.SESSION_SECRET, payload);
	return `${payload}.${sig}`;
}

/**
 * Verify a session cookie value, returning the authenticated email or null.
 *
 * Also confirms the mailbox record still exists in R2 — sessions are
 * self-contained signed tokens with no server-side revocation list, so this
 * existence check is what makes an admin deleting a mailbox actually revoke
 * any of that user's still-unexpired sessions immediately, everywhere.
 */
export async function verifySession(env: Env, cookieValue: string | undefined): Promise<string | null> {
	if (!cookieValue) return null;
	const [payload, sig] = cookieValue.split(".");
	if (!payload || !sig) return null;
	const expectedSig = await hmac(env.SESSION_SECRET, payload);
	if (!timingSafeEqual(sig, expectedSig)) return null;
	let email: string;
	try {
		const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
		if (typeof parsed.email !== "string" || typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
		email = parsed.email.toLowerCase();
	} catch {
		return null;
	}
	if (!(await env.BUCKET.head(`mailboxes/${email}.json`))) return null;
	return email;
}
