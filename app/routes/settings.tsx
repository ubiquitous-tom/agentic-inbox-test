// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon, KeyIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import api from "~/services/api";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [forwardingEnabled, setForwardingEnabled] = useState(false);
	const [forwardingEmail, setForwardingEmail] = useState("");
	const [agentPanelDefaultOpen, setAgentPanelDefaultOpen] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [hasMcpToken, setHasMcpToken] = useState(false);
	const [mcpToken, setMcpToken] = useState<string | null>(null);
	const [isGeneratingToken, setIsGeneratingToken] = useState(false);
	const [isRevokingToken, setIsRevokingToken] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setForwardingEnabled(mailbox.settings?.forwarding?.enabled || false);
			setForwardingEmail(mailbox.settings?.forwarding?.email || "");
			setAgentPanelDefaultOpen(mailbox.settings?.agentPanelDefaultOpen ?? true);
			setHasMcpToken(!!mailbox.settings?.mcp?.tokenHash);
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			forwarding: { enabled: forwardingEnabled, email: forwardingEmail.trim() },
			agentPanelDefaultOpen,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	const handleGenerateMcpToken = async () => {
		if (!mailboxId) return;
		setIsGeneratingToken(true);
		try {
			const { token } = await api.generateMcpToken(mailboxId);
			setMcpToken(token);
			setHasMcpToken(true);
		} catch {
			toastManager.add({ title: "Failed to generate token", variant: "error" });
		} finally {
			setIsGeneratingToken(false);
		}
	};

	const handleRevokeMcpToken = async () => {
		if (!mailboxId) return;
		setIsRevokingToken(true);
		try {
			await api.revokeMcpToken(mailboxId);
			setHasMcpToken(false);
			setMcpToken(null);
			toastManager.add({ title: "MCP access revoked" });
		} catch {
			toastManager.add({ title: "Failed to revoke access", variant: "error" });
		} finally {
			setIsRevokingToken(false);
		}
	};

	const handleCopyMcpToken = () => {
		if (!mcpToken) return;
		navigator.clipboard.writeText(mcpToken);
		toastManager.add({ title: "Copied to clipboard" });
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Forwarding */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Forwarding
					</div>
					<div className="space-y-3">
						<Switch
							label="Forward a copy of every incoming email"
							checked={forwardingEnabled}
							onCheckedChange={setForwardingEnabled}
						/>
						<Input
							label="Forward to"
							type="email"
							placeholder="someone@example.com"
							value={forwardingEmail}
							onChange={(e) => setForwardingEmail(e.target.value)}
							disabled={!forwardingEnabled}
						/>
					</div>
				</div>

				{/* MCP access */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<KeyIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">
							MCP access
						</span>
						{hasMcpToken && <Badge variant="secondary">Enabled</Badge>}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Let an MCP client (Claude Code, Claude Desktop, Cursor) read and manage
						this mailbox directly. Generates a bearer token scoped to just this
						mailbox plus any shared mailboxes — no separate login needed.
					</p>
					{mcpToken && (
						<div className="mb-3 rounded-lg border border-kumo-line bg-kumo-recessed p-3">
							<div className="text-xs text-kumo-subtle mb-2">
								Copy this now — it won't be shown again.
							</div>
							<div className="flex items-center gap-2 mb-2">
								<code className="flex-1 min-w-0 truncate text-xs font-mono text-kumo-default">
									{mcpToken}
								</code>
								<Button
									variant="ghost"
									size="xs"
									icon={<CopyIcon size={14} />}
									onClick={handleCopyMcpToken}
								>
									Copy
								</Button>
							</div>
							<div className="text-xs text-kumo-subtle">
								Connect to{" "}
								<code className="font-mono">
									{typeof window !== "undefined" ? window.location.origin : ""}/mcp
								</code>{" "}
								with headers{" "}
								<code className="font-mono">Authorization: Bearer &lt;token&gt;</code> and{" "}
								<code className="font-mono">X-Mailbox-Id: {mailbox.email}</code>.
							</div>
						</div>
					)}
					<div className="flex gap-2">
						<Button
							variant="secondary"
							size="sm"
							loading={isGeneratingToken}
							onClick={handleGenerateMcpToken}
						>
							{hasMcpToken ? "Regenerate token" : "Generate token"}
						</Button>
						{hasMcpToken && (
							<Button
								variant="destructive"
								size="sm"
								loading={isRevokingToken}
								onClick={handleRevokeMcpToken}
							>
								Revoke access
							</Button>
						)}
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<Switch
						label="Open agent panel automatically"
						checked={agentPanelDefaultOpen}
						onCheckedChange={setAgentPanelDefaultOpen}
						className="mb-3"
					/>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
