// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Light/dark/system theme control. Kumo's design tokens resolve automatically
 * via CSS `light-dark()`, keyed off `color-scheme` — which Kumo sets to `dark`
 * only when the `data-mode="dark"` attribute is present on <html> (see
 * kumo-binding.css). This store is the single place that attribute gets set.
 */
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function getStoredMode(): ThemeMode {
	if (typeof localStorage === "undefined") return "system";
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === "light" || stored === "dark" ? stored : "system";
}

function prefersDark(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
	return mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
}

function applyMode(mode: ThemeMode) {
	if (typeof document === "undefined") return;
	if (resolveMode(mode) === "dark") {
		document.documentElement.setAttribute("data-mode", "dark");
	} else {
		document.documentElement.removeAttribute("data-mode");
	}
}

interface ThemeState {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
	mode: getStoredMode(),
	setMode: (mode) => {
		if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
		applyMode(mode);
		set({ mode });
	},
}));

if (typeof window !== "undefined") {
	applyMode(getStoredMode());
	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		if (useThemeStore.getState().mode === "system") applyMode("system");
	});
}
