"use client";

import { Check, Copy } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Figure } from "./primitives";

const COMMAND = "npx -y nestjs-doctor@latest .";
const COPIED_RESET_MS = 1600;

const CopyCommand = () => {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(COMMAND);
			setCopied(true);
			setTimeout(() => setCopied(false), COPIED_RESET_MS);
		} catch {
			// Clipboard is unavailable outside a secure context.
		}
	}, []);

	const Icon = copied ? Check : Copy;

	return (
		<div className="inline-flex max-w-full items-stretch border border-white/30">
			<span className="flex items-center border-white/30 border-r px-3.5 font-bold text-[11px] text-white/70 tracking-[0.08em]">
				Rx
			</span>
			<code className="overflow-x-auto whitespace-nowrap px-4 py-3 text-[#f2f1ef]">
				<span className="text-white/70">$ </span>
				{COMMAND}
			</code>
			<button
				aria-label="Copy the command"
				className="flex items-center border-white/30 border-l px-4 text-white/70 transition-colors hover:bg-white hover:text-black"
				onClick={handleCopy}
				type="button"
			>
				<Icon size={14} />
			</button>
		</div>
	);
};

/** Some browsers defer autoplay until the element is ready. */
const Recording = () => {
	const ref = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = ref.current;
		if (!video) {
			return;
		}
		const start = () => {
			video.play().catch(() => {
				// Autoplay refused; the poster frame stays.
			});
		};
		start();
		video.addEventListener("canplay", start, { once: true });
		document.addEventListener("visibilitychange", start);
		return () => document.removeEventListener("visibilitychange", start);
	}, []);

	return (
		<video
			aria-label="A terminal recording: nestjs-doctor scores a project 35 out of 100, an agent fixes the findings, and a rescan scores 100"
			autoPlay
			className="min-h-0 flex-1 bg-black object-contain"
			loop
			muted
			playsInline
			ref={ref}
		>
			<source src="/demo.mp4" type="video/mp4" />
		</video>
	);
};

export const Hero = () => (
	<section className="grid min-h-0 flex-1 gap-12 border-white/15 border-b py-6 lg:grid-cols-[52fr_48fr]">
		<div className="self-center">
			<h1 className="mt-0 mb-4 text-balance font-extralight text-[#f2f1ef] text-[clamp(30px,3.4vw,46px)] leading-[1.08] tracking-[-0.02em]">
				The deterministic, visual devtool for NestJS that{" "}
				<span className="font-bold text-nest-red">catches AI mistakes.</span>
			</h1>
			<p className="mb-5 max-w-[66ch] text-[13px] text-white/[0.92] leading-relaxed">
				An opinionated rule set for an opinionated framework, a reviewer for
				your PRs. Maps your modules, database, and boot in a visual report.
				Extends with rules you write yourself.
			</p>

			<CopyCommand />

			<p className="mt-5 inline-block border-white/15 border-t border-b py-2 font-bold text-[11px] text-white/[0.92] uppercase tracking-[0.08em]">
				0 network calls · 0 AI calls · same output every run
			</p>
		</div>

		<Figure
			caption="Fig. 01 — Examination recording"
			className="min-h-0"
			meta="$ npx -y nestjs-doctor@latest ."
		>
			<Recording />
			<div className="border-white/30 border-t px-4 py-2 font-bold text-[11px] text-white/75 uppercase tracking-[0.08em]">
				Recording · real scan, real findings · loops
			</div>
		</Figure>
	</section>
);

export const Nav = () => (
	<nav className="flex flex-wrap items-stretch justify-between gap-4 border-white/30 border-b py-2">
		<a
			className="flex items-center gap-3 font-bold text-[#f2f1ef] text-[13px] tracking-[0.08em] no-underline"
			href="/"
		>
			<Image alt="" height={20} src="/logo.png" width={20} />
			NESTJS-DOCTOR
		</a>
		<div className="flex gap-2">
			{[
				{ href: "/docs", label: "docs" },
				{ href: "https://github.com/RoloBits/nestjs-doctor", label: "github" },
			].map((link) => (
				<a
					className="inline-flex items-center border border-white/30 px-4 py-1.5 font-bold text-[11px] text-white/75 uppercase tracking-[0.08em] no-underline transition-colors hover:border-white hover:bg-white hover:text-black"
					href={link.href}
					key={link.href}
				>
					{link.label}
				</a>
			))}
		</div>
	</nav>
);
