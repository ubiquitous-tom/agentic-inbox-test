<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How it works now

This fork diverges from the upstream template in a few important ways:

- **Two identity systems, not one.** Cloudflare Access still gates the admin
  area (`/admin` and `/api/v1/admin/*`), but everyday mailbox users log in
  with an email + password instead of needing an Access seat. See
  [Authentication](#authentication) below.
- **Per-mailbox authorization.** A logged-in user can only reach their own
  mailbox plus whatever's listed in `SHARED_MAILBOX_ADDRESSES` — not every
  mailbox in the system. See [Mailbox access](#mailbox-access).
- **An admin panel** (`/admin`) for provisioning, resetting, and removing
  mailbox accounts. See [Admin panel](#admin-panel).
- **Per-mailbox email forwarding**, dark mode, and a per-mailbox "open agent
  panel automatically" setting. See [Other settings](#other-settings).
- **Deploy is domain-agnostic.** `wrangler.jsonc` no longer hardcodes a
  domain or business-specific values — the same codebase can be deployed to
  more than one personal domain. See
  [Deploying to another domain](#deploying-to-another-domain).

### Authentication

There are two, independent ways to authenticate, gating two different parts
of the app:

| | Who | Gates | Mechanism |
|---|---|---|---|
| **Admin** | Whoever matches the `ADMIN_EMAIL` var | `/admin`, `/api/v1/admin/*` | Cloudflare Access JWT (`cf-access-jwt-assertion` header, verified against `POLICY_AUD`/`TEAM_DOMAIN`) |
| **Mailbox users** | Anyone the admin has provisioned a mailbox for | Everything else (`/mailbox/*`, `/api/v1/mailboxes/*`) | Self-service email + password, independent of Access |

Regular users never need an Access seat. Their flow:

1. **Admin creates the mailbox** — `/admin` → "New mailbox", entering the
   mailbox address and the person's real (recovery) email address. This
   emails them an activation link (`workers/routes/admin.ts` ->
   `handleCreateAdminMailbox`).
2. **Activate** — `/activate?email=...&token=...` lets them set a password.
   The link expires after 24 hours.
3. **Log in** — `/login`, email + password. On success the server sets an
   HMAC-signed, stateless session cookie (`workers/lib/auth.ts`); there's no
   server-side session table — a cookie stays valid only as long as its
   signature checks out, it hasn't expired, and the mailbox record still
   exists in R2.
4. **Forgot password** — `/forgot-password` emails a reset link (1 hour
   expiry) to the recovery address on file; `/reset-password` sets a new one.
5. **Log out** — the "Log out" button in the sidebar (`POST
   /api/v1/auth/logout`) clears the session cookie.

Passwords are hashed with PBKDF2 (Web Crypto `subtle.deriveBits`) before
being stored in R2 — the plaintext password is never persisted.

### Mailbox access

Every mailbox is either **private** (only the person it belongs to can open
it — their own email address must match the mailbox ID) or **shared**
(listed in the `SHARED_MAILBOX_ADDRESSES` var, visible to every logged-in
user in addition to their own private mailbox). This check happens in
`workers/lib/mailbox.ts` (`requireMailbox`) on every mailbox-scoped API call.

### Admin panel

Visit `/admin` (behind Cloudflare Access) to:

- **See every mailbox** and whether it's activated or still pending.
- **Create a mailbox** — sends the activation email described above.
- **Delete a mailbox** — pending ones just cancel the invite; active ones
  require typing the address to confirm. Deleting an active mailbox works
  immediately because there's no session table to also clean up — the
  session cookie becomes invalid the moment the mailbox record is gone
  (`verifySession` re-checks R2 on every request).
- **Reset a user's password** — re-sends an activation-style link to their
  recovery email.
- **Change a user's recovery email** — for when they've lost access to the
  original one.

### Other settings

Per-mailbox, under Settings (`/mailbox/:mailboxId/settings`):

- **Forwarding** — toggle + destination address. When enabled, every
  incoming email to that mailbox is also forwarded on
  (`event.forward()` in `workers/index.ts` -> `receiveEmail`).
- **Open agent panel automatically** — whether the AI agent side panel opens
  by default when you visit that mailbox.

Mail sent to an address with no provisioned mailbox yet is forwarded to
`MASTER_NOTIFICATION_EMAIL` instead of being silently dropped.

App-wide, via the theme toggle in the top-right of the auth pages / sidebar:
**dark mode** — light, dark, or follow-system, persisted to `localStorage`
with no flash-of-wrong-theme on load (`app/hooks/useTheme.ts`).

## Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` are incorrect. These only gate `/admin`, so this only affects the admin panel, not regular mailbox users.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then update the `POLICY_AUD` secret and `TEAM_DOMAIN` var to the latest values shown there.
2. If you see `Cloudflare Access must be configured in production`, `/admin` is intentionally fail-closed without Access configured.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set `POLICY_AUD` (secret) and `TEAM_DOMAIN` (var) from the modal values.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Self-service auth + admin-provisioned accounts** — see [Authentication](#authentication) and [Admin panel](#admin-panel)
- **Per-mailbox forwarding and settings** — see [Other settings](#other-settings)
- **Dark mode** — light, dark, or follow-system
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation for `/admin` (required outside local development); self-service PBKDF2 + HMAC-signed session cookies for regular mailbox users

## Getting Started

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in local-dev values
npm run dev
```

`.dev.vars` is gitignored — see `.dev.vars.example` for what each value does and which ones are dev-only vs. also used in production.

### Deploy

Deploys are driven by `scripts/deploy.sh` rather than raw `wrangler deploy`, because business-specific config (domain, admin email, etc.) is no longer stored in `wrangler.jsonc` — it's supplied per-deployment so the same codebase can serve more than one personal domain.

```bash
cp .env.deploy.example .env.deploy.<label>   # e.g. .env.deploy.cumuluselements
# fill in .env.deploy.<label>, then:
npm run deploy -- <label>
```

`<label>` is just a name you pick — it selects which `.env.deploy.<label>` file to read. The first time you deploy for a given Worker, also set the two secrets once:

```bash
npx wrangler secret put POLICY_AUD
npx wrangler secret put SESSION_SECRET
```

`POLICY_AUD`/`TEAM_DOMAIN` come from enabling Cloudflare Access on the Worker (see [Prerequisites](#prerequisites)) — `SESSION_SECRET` can be any long random string (e.g. `openssl rand -hex 32`).

### Deploying to another domain

Each additional domain is a **fully separate Worker deployment** — its own Worker name, its own R2 bucket, its own Durable Object storage, its own mailboxes/admin — not one Worker serving multiple domains. That isolation needs a named environment in `wrangler.jsonc`, because Wrangler doesn't inherit resource bindings (R2 buckets, Durable Objects, `ai`, `send_email`) across environments by design.

1. **Add the domain as a zone** on your Cloudflare account (Websites -> Add a site), if it isn't already.
2. **Create a new R2 bucket** for this deployment, e.g. `npx wrangler r2 bucket create agentic-inbox-<label>`.
3. **Add a named environment block** to `wrangler.jsonc`, picking a `<label>` (used consistently below):

   ```jsonc
   "env": {
     "<label>": {
       "name": "agentic-inbox-<label>",
       "send_email": [{ "name": "EMAIL", "remote": true }],
       "r2_buckets": [
         { "binding": "BUCKET", "bucket_name": "agentic-inbox-<label>", "preview_bucket_name": "agentic-inbox-<label>" }
       ],
       "ai": { "binding": "AI" },
       "durable_objects": {
         "bindings": [
           { "name": "MAILBOX", "class_name": "MailboxDO" },
           { "name": "EMAIL_AGENT", "class_name": "EmailAgent" },
           { "name": "EMAIL_MCP", "class_name": "EmailMCP" }
         ]
       }
     }
   }
   ```

   (`migrations`, `compatibility_date`, `compatibility_flags`, and `main` are inherited automatically — no need to repeat them.)

4. **Set that Worker's secrets** (a named environment is a distinct Worker, so it needs its own):

   ```bash
   npx wrangler secret put POLICY_AUD --env <label>
   npx wrangler secret put SESSION_SECRET --env <label>
   ```

5. **Create `.env.deploy.<label>`** from `.env.deploy.example`, filling in `DEPLOY_DOMAIN` for the new domain and setting `WRANGLER_ENV=<label>` (this is what tells `scripts/deploy.sh` to pass `--env <label>` to Wrangler, targeting the block from step 3 instead of the default deployment).
6. **Deploy:** `npm run deploy -- <label>`. This also attaches the custom domain automatically via `--domain`.
7. **Configure Cloudflare Access** for this new Worker (one-click Access under its Settings > Domains & Routes), then re-run step 4's `POLICY_AUD` command with the real value from the modal, and set `TEAM_DOMAIN` in `.env.deploy.<label>` from the same modal.
8. **Set up Email Routing** for the new domain — catch-all rule forwarding to this Worker.
9. **Create the first mailbox** via `/admin` on the new deployment.

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured (required in production, but only gates `/admin` — see [Authentication](#authentication))

The MCP server at `/mcp` is unauthenticated by the per-mailbox model above — external AI tools (Claude Code, Cursor, etc.) connected via MCP can still operate on any mailbox by passing a `mailboxId` parameter, the same as before this fork's authorization changes. Treat `/mcp` as trusted-network-only, or don't expose it, until it's wired into the same per-user authorization checks as the HTTP API.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
