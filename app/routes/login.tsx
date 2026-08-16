// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import ThemeToggle from "~/components/ThemeToggle";
import api, { ApiError } from "~/services/api";

export function meta() {
	return [{ title: "Log in — Agentic Inbox" }];
}

export default function LoginRoute() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsSubmitting(true);
		try {
			const { email: loggedInEmail } = await api.login(email, password);
			navigate(`/mailbox/${loggedInEmail}`);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to log in");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-kumo-recessed px-4">
			<div className="fixed top-4 right-4">
				<ThemeToggle />
			</div>
			<div className="w-full max-w-sm rounded-xl border border-kumo-line bg-kumo-base p-6">
				<h1 className="text-xl font-bold text-kumo-default mb-5">Log in</h1>
				<form onSubmit={handleSubmit} className="space-y-4">
					{error && <Text variant="error" size="sm">{error}</Text>}
					<Input
						label="Email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<Input
						label="Password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					<Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
						Log in
					</Button>
				</form>
				<RouterLink
					to="/forgot-password"
					className="block mt-4 text-sm text-kumo-subtle hover:text-kumo-default"
				>
					Forgot your password?
				</RouterLink>
			</div>
		</div>
	);
}
