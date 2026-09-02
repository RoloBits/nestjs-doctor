"use client";

import { Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { play, setSoundsEnabled, soundsEnabled } from "@/lib/sounds";

/** Rendered until the client mounts, so the server and the browser agree. */
const CLOCK_PLACEHOLDER = "--:--";
const TICK_MS = 15_000;

const formatClock = (now: Date): string =>
	now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const formatDate = (now: Date): string =>
	now.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	});

const AppleGlyph = () => (
	<svg
		aria-hidden="true"
		className="h-3.5 w-3.5 text-white/90"
		fill="currentColor"
		viewBox="0 0 24 24"
	>
		<path d="M17.05 12.54c-.02-2.4 1.96-3.55 2.05-3.61-1.12-1.63-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.61.02-3.1.94-3.93 2.38-1.68 2.91-.43 7.21 1.2 9.57.8 1.15 1.75 2.45 3 2.4 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.14.75 1.3-.02 2.12-1.17 2.91-2.33.92-1.34 1.3-2.64 1.32-2.7-.03-.01-2.53-.97-2.55-3.85M14.7 5.4c.66-.8 1.11-1.92.99-3.03-.95.04-2.11.63-2.79 1.43-.61.71-1.15 1.85-1 2.94 1.06.08 2.14-.54 2.8-1.34" />
	</svg>
);

/** The strip along the top of the desktop. The clock is the only live part. */
export const MenuBar = ({ section }: { section: string }) => {
	const [now, setNow] = useState<Date | null>(null);
	const [sounds, setSounds] = useState(true);

	useEffect(() => {
		setSounds(soundsEnabled());
	}, []);

	const toggleSounds = () => {
		const next = !sounds;
		setSounds(next);
		if (next) {
			setSoundsEnabled(true);
			play("toggle");
		} else {
			play("toggle");
			setSoundsEnabled(false);
		}
	};

	useEffect(() => {
		setNow(new Date());
		const timer = setInterval(() => setNow(new Date()), TICK_MS);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="flex h-6 shrink-0 items-center gap-4 whitespace-nowrap bg-black/40 px-4 text-[11px] text-white/80 backdrop-blur-xl">
			<Link className="flex items-center" href="/">
				<AppleGlyph />
			</Link>
			<Link className="font-bold text-white" data-cuelume-hover="tick" href="/">
				nestjs-doctor
			</Link>
			<span>{section}</span>
			<Link
				className="hidden hover:text-white sm:inline"
				data-cuelume-hover="tick"
				href="/docs"
			>
				Docs
			</Link>
			<a
				className="hidden hover:text-white sm:inline"
				data-cuelume-hover="tick"
				href="https://github.com/RoloBits/nestjs-doctor"
				rel="noreferrer"
				target="_blank"
			>
				GitHub
			</a>
			<div className="ml-auto flex items-center gap-4">
				<button
					aria-label="Sounds"
					aria-pressed={sounds}
					className="flex cursor-pointer items-center hover:text-white"
					onClick={toggleSounds}
					type="button"
				>
					{sounds ? <Volume2 size={12} /> : <VolumeX size={12} />}
				</button>
				<span className="hidden sm:inline">{now ? formatDate(now) : ""}</span>
				<span>{now ? formatClock(now) : CLOCK_PLACEHOLDER}</span>
			</div>
		</div>
	);
};
