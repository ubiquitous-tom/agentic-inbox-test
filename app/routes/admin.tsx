// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Text, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, EnvelopeSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import api, { ApiError } from "~/services/api";

export function meta() {
	return [{ title: "Admin — Agentic Inbox" }];
}

type AdminMailbox = { id: string; email: string; recoveryEmail: string | null; activated: boolean };

export default function AdminRoute() {
	const toastManager = useKumoToastManager();
	const qc = useQueryClient();
	const { data: mailboxes = [], isLoading } = useQuery({
		queryKey: ["admin", "mailboxes"],
		queryFn: () => api.adminListMailboxes(),
	});

	const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "mailboxes"] });

	// Create dialog
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [recoveryEmail, setRecoveryEmail] = useState("");
	const [name, setName] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

	// Delete confirmation — active mailboxes require typing the address first
	const [mailboxToDelete, setMailboxToDelete] = useState<AdminMailbox | null>(null);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	// Change recovery email dialog
	const [mailboxToEdit, setMailboxToEdit] = useState<AdminMailbox | null>(null);
	const [newRecoveryEmail, setNewRecoveryEmail] = useState("");
	const [editError, setEditError] = useState<string | null>(null);
	const [isSavingRecovery, setIsSavingRecovery] = useState(false);

	// Reset password (no dialog needed — just an email send, not destructive)
	const [resettingId, setResettingId] = useState<string | null>(null);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		setIsCreating(true);
		try {
			await api.adminCreateMailbox(email, recoveryEmail, name || undefined);
			toastManager.add({ title: `Activation email sent to ${recoveryEmail}` });
			setIsCreateOpen(false);
			setEmail("");
			setRecoveryEmail("");
			setName("");
			invalidate();
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Failed to create mailbox");
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await api.adminDeleteMailbox(mailboxToDelete.id);
			toastManager.add({ title: `Removed ${mailboxToDelete.email}` });
			setMailboxToDelete(null);
			invalidate();
		} catch {
			toastManager.add({ title: "Failed to remove mailbox", variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const handleResetPassword = async (m: AdminMailbox) => {
		setResettingId(m.id);
		try {
			await api.adminResetPassword(m.id);
			toastManager.add({ title: `Reset link sent to ${m.recoveryEmail}` });
		} catch {
			toastManager.add({ title: "Failed to send reset link", variant: "error" });
		} finally {
			setResettingId(null);
		}
	};

	const handleSaveRecoveryEmail = async (e: FormEvent) => {
		e.preventDefault();
		if (!mailboxToEdit) return;
		setEditError(null);
		setIsSavingRecovery(true);
		try {
			await api.adminChangeRecoveryEmail(mailboxToEdit.id, newRecoveryEmail);
			toastManager.add({ title: `Recovery email updated for ${mailboxToEdit.email}` });
			setMailboxToEdit(null);
			invalidate();
		} catch (err) {
			setEditError(err instanceof ApiError ? err.message : "Failed to update recovery email");
		} finally {
			setIsSavingRecovery(false);
		}
	};

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-16">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="text-2xl font-bold text-kumo-default">All mailboxes</h1>
					<Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setIsCreateOpen(true)}>
						New mailbox
					</Button>
				</div>

				{isLoading ? (
					<Text size="sm">Loading…</Text>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						{mailboxes.map((m, idx) => (
							<div
								key={m.id}
								className={`flex items-center justify-between gap-4 px-5 py-4 ${idx > 0 ? "border-t border-kumo-line" : ""}`}
							>
								<div className="min-w-0">
									<div className="text-sm font-medium text-kumo-default truncate">{m.email}</div>
									{m.recoveryEmail && (
										<div className="text-sm text-kumo-subtle truncate">recovery: {m.recoveryEmail}</div>
									)}
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<Badge variant={m.activated ? "secondary" : "primary"}>
										{m.activated ? "Active" : "Pending activation"}
									</Badge>
									{m.activated && (
										<>
											<Tooltip content="Reset password" asChild>
												<Button
													variant="ghost"
													size="sm"
													shape="square"
													icon={<ArrowsClockwiseIcon size={16} />}
													aria-label={`Reset password for ${m.email}`}
													loading={resettingId === m.id}
													onClick={() => handleResetPassword(m)}
												/>
											</Tooltip>
											<Tooltip content="Change recovery email" asChild>
												<Button
													variant="ghost"
													size="sm"
													shape="square"
													icon={<EnvelopeSimpleIcon size={16} />}
													aria-label={`Change recovery email for ${m.email}`}
													onClick={() => {
														setMailboxToEdit(m);
														setNewRecoveryEmail(m.recoveryEmail || "");
														setEditError(null);
													}}
												/>
											</Tooltip>
										</>
									)}
									<Tooltip content="Delete" asChild>
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											icon={<TrashIcon size={16} />}
											aria-label={`Delete ${m.email}`}
											onClick={() => {
												setMailboxToDelete(m);
												setDeleteConfirmText("");
											}}
										/>
									</Tooltip>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Create mailbox */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">Create mailbox</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && <Text variant="error" size="sm">{createError}</Text>}
						<Input
							label="Mailbox address"
							type="email"
							placeholder="alice@cumuluselements.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
						<Input
							label="Recovery email (theirs — activation link goes here)"
							type="email"
							placeholder="alice.personal@gmail.com"
							value={recoveryEmail}
							onChange={(e) => setRecoveryEmail(e.target.value)}
							required
						/>
						<Input
							label="Display name (optional)"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>}
							/>
							<Button type="submit" variant="primary" size="sm" loading={isCreating}>
								Create &amp; send activation email
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete mailbox */}
			<Dialog.Root
				open={!!mailboxToDelete}
				onOpenChange={(open) => !open && setMailboxToDelete(null)}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Delete mailbox</Dialog.Title>
					{mailboxToDelete?.activated ? (
						<>
							<Dialog.Description className="text-kumo-subtle text-sm mb-4">
								This permanently deletes the account for{" "}
								<strong className="text-kumo-default">{mailboxToDelete.email}</strong>.
								They'll no longer be able to log in. Type the address to confirm.
							</Dialog.Description>
							<Input
								aria-label="Confirm mailbox address"
								placeholder={mailboxToDelete.email}
								value={deleteConfirmText}
								onChange={(e) => setDeleteConfirmText(e.target.value)}
								className="mb-5"
							/>
						</>
					) : (
						<Dialog.Description className="text-kumo-subtle text-sm mb-5">
							Are you sure you want to remove{" "}
							<strong className="text-kumo-default">{mailboxToDelete?.email}</strong>? It
							hasn't been activated yet, so this just cancels the pending invite.
						</Dialog.Description>
					)}
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>}
						/>
						<Button
							variant="destructive"
							size="sm"
							loading={isDeleting}
							disabled={mailboxToDelete?.activated && deleteConfirmText !== mailboxToDelete.email}
							onClick={handleDelete}
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			{/* Change recovery email */}
			<Dialog.Root
				open={!!mailboxToEdit}
				onOpenChange={(open) => !open && setMailboxToEdit(null)}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						Change recovery email for {mailboxToEdit?.email}
					</Dialog.Title>
					<form onSubmit={handleSaveRecoveryEmail} className="space-y-4">
						{editError && <Text variant="error" size="sm">{editError}</Text>}
						<Input
							label="New recovery email"
							type="email"
							value={newRecoveryEmail}
							onChange={(e) => setNewRecoveryEmail(e.target.value)}
							required
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>}
							/>
							<Button type="submit" variant="primary" size="sm" loading={isSavingRecovery}>
								Save
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
