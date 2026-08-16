// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useThemeStore } from "~/hooks/useTheme";
import type { ThemeMode } from "~/hooks/useTheme";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
	light: "dark",
	dark: "system",
	system: "light",
};

const MODE_ICON: Record<ThemeMode, React.ReactNode> = {
	light: <SunIcon size={20} />,
	dark: <MoonIcon size={20} />,
	system: <DesktopIcon size={20} />,
};

const MODE_LABEL: Record<ThemeMode, string> = {
	light: "Theme: Light",
	dark: "Theme: Dark",
	system: "Theme: System",
};

export default function ThemeToggle() {
	const { mode, setMode } = useThemeStore();

	return (
		<Tooltip content={MODE_LABEL[mode]} side="bottom" asChild>
			<Button
				variant="ghost"
				shape="square"
				icon={MODE_ICON[mode]}
				onClick={() => setMode(NEXT_MODE[mode])}
				aria-label={MODE_LABEL[mode]}
			/>
		</Tooltip>
	);
}
