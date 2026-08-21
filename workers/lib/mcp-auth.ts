// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Authentication for the /mcp endpoint. Independent of both Cloudflare
 * Access (admin only) and the browser session cookie (regular users don't
 * carry a cookie jar to an MCP client) — MCP clients authenticate with a
 * per-mailbox bearer token instead, generated self-service from that
 * mailbox's own Settings page (see workers/index.ts -> POST .../mcp-token).
 */
import type { Context } from "hono";
import { verifyToken } from "./auth";
import { parseAddressList, type MailboxSettings } from "./email-helpers";
import type { Env } from "../types";

/** Identity resolved from a valid MCP bearer token, passed into the EmailMCP Durable Object via `ctx.props`. */
export type McpAuthProps = {
	mailboxId: string;
	sharedAddresses: string[];
};

/**
 * Validate the Authorization bearer token + X-Mailbox-Id header pair against
 * that mailbox's stored token hash. Returns the resolved identity on
 * success, or a 401 Response to return as-is on failure.
 */
export async function authenticateMcpRequest(
	c: Context<{ Bindings: Env }>,
): Promise<McpAuthProps | Response> {
	const bearerMatch = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
	const token = bearerMatch?.[1];
	const mailboxId = c.req.header("x-mailbox-id")?.trim().toLowerCase();
	if (!token || !mailboxId) {
		return c.text("Missing Authorization bearer token or X-Mailbox-Id header", 401);
	}

	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.text("Unknown mailbox", 401);
	const settings = (await obj.json()) as MailboxSettings;

	if (!settings.mcp?.tokenHash || !(await verifyToken(token, settings.mcp.tokenHash))) {
		return c.text("Invalid MCP token", 401);
	}

	return { mailboxId, sharedAddresses: parseAddressList(c.env.SHARED_MAILBOX_ADDRESSES) };
}
