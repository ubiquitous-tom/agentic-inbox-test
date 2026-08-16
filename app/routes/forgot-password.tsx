// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { Link as RouterLink } from "react-router";
import ThemeToggle from "~/components/ThemeToggle";
import api from "~/services/api";

export function meta() {
	return [{ title: "Forgot password — Agentic Inbox" }];
}

export default function ForgotPasswordRoute() {
	const [email, setEmail] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		try {
			await api.requestPasswordReset(email);
		} finally {
			// Always show the same result, whether or not the mailbox exists.
			setIsSubmitting(false);
			setSubmitted(true);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-kumo-recessed px-4">
			<div className="fixed top-4 right-4">
				<ThemeToggle />
			</div>
			<div className="w-full max-w-sm rounded-xl border border-kumo-line bg-kumo-base p-6">
				<h1 className="text-xl font-bold text-kumo-default mb-1.5">Forgot password</h1>
				{submitted ? (
					<Text size="sm">
						If that mailbox exists, a reset link has been sent to its recovery
						address.
					</Text>
				) : (
					<>
						<p className="text-sm text-kumo-subtle mb-5">
							Enter your mailbox address and we'll send a reset link to your recovery email.
						</p>
						<form onSubmit={handleSubmit} className="space-y-4">
							<Input
								label="Mailbox address"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
							<Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
								Send reset link
							</Button>
						</form>
					</>
				)}
				<RouterLink to="/login" className="block mt-4 text-sm text-kumo-subtle hover:text-kumo-default">
					Back to log in
				</RouterLink>
			</div>
		</div>
	);
}
