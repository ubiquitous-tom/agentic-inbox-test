// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import ThemeToggle from "~/components/ThemeToggle";
import api, { ApiError } from "~/services/api";

export function meta() {
	return [{ title: "Reset password — Agentic Inbox" }];
}

export default function ResetPasswordRoute() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const email = searchParams.get("email") || "";
	const token = searchParams.get("token") || "";

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		if (password !== confirmPassword) {
			setError("Passwords don't match");
			return;
		}
		setIsSubmitting(true);
		try {
			const { email: resetEmail } = await api.resetPassword(email, token, password);
			navigate(`/mailbox/${resetEmail}`);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Failed to reset password");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!email || !token) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-kumo-recessed px-4">
				<Text variant="error">This reset link is missing required information.</Text>
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-kumo-recessed px-4">
			<div className="fixed top-4 right-4">
				<ThemeToggle />
			</div>
			<div className="w-full max-w-sm rounded-xl border border-kumo-line bg-kumo-base p-6">
				<h1 className="text-xl font-bold text-kumo-default mb-1.5">Reset password for {email}</h1>
				<form onSubmit={handleSubmit} className="space-y-4 mt-4">
					{error && <Text variant="error" size="sm">{error}</Text>}
					<Input
						label="New password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						minLength={8}
					/>
					<Input
						label="Confirm new password"
						type="password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						minLength={8}
					/>
					<Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
						Reset password
					</Button>
				</form>
			</div>
		</div>
	);
}
