// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader } from "@cloudflare/kumo";
import { EnvelopeIcon, UsersIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import { useMailboxes } from "~/queries/mailboxes";
import type { Mailbox } from "~/types";

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

function MailboxRow({ account, isFirst }: { account: Mailbox; isFirst: boolean }) {
	return (
		<RouterLink
			to={`/mailbox/${account.id}`}
			className={`group flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-kumo-tint ${
				isFirst ? "" : "border-t border-kumo-line"
			}`}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kumo-fill text-sm font-bold text-kumo-default">
				{account.name.charAt(0).toUpperCase()}
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-kumo-default truncate">
					{account.name}
				</div>
				<div className="text-sm text-kumo-subtle">{account.email}</div>
			</div>
		</RouterLink>
	);
}

export default function HomeRoute() {
	const navigate = useNavigate();
	const { data: mailboxes = [], isFetched } = useMailboxes();

	const mine = mailboxes.find((m) => m.type === "private");
	const shared = mailboxes.filter((m) => m.type === "shared");

	// With only one mailbox (the common case), this picker just adds an extra
	// click — skip straight to it instead of showing a list of one.
	useEffect(() => {
		if (isFetched && mailboxes.length === 1) {
			navigate(`/mailbox/${mailboxes[0].id}`, { replace: true });
		}
	}, [isFetched, mailboxes, navigate]);

	if (isFetched && mailboxes.length === 1) {
		return null;
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-16">
				<div className="mb-8">
					<h1 className="text-2xl font-bold text-kumo-default">Mailboxes</h1>
				</div>

				{!isFetched ? (
					<div className="flex justify-center py-20">
						<Loader size="lg" />
					</div>
				) : (
					<div className="space-y-8">
						{mine && (
							<div>
								<div className="flex items-center gap-1.5 mb-2 px-1">
									<EnvelopeIcon size={14} className="text-kumo-subtle" />
									<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
										My Mailbox
									</span>
								</div>
								<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
									<MailboxRow account={mine} isFirst />
								</div>
							</div>
						)}

						{shared.length > 0 && (
							<div>
								<div className="flex items-center gap-1.5 mb-2 px-1">
									<UsersIcon size={14} className="text-kumo-subtle" />
									<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
										Team Mailboxes
									</span>
								</div>
								<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
									{shared.map((account, idx) => (
										<MailboxRow key={account.id} account={account} isFirst={idx === 0} />
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
