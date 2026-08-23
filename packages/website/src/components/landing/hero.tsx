"use client";

import { useEffect, useRef } from "react";
import { CommandBlock } from "./command-block";
import { Figure } from "./primitives";

const COMMAND = "npx -y nestjs-doctor@latest .";

const POINTS = [
	"An opinionated rule set for an opinionated framework.",
	"A reviewer for your PRs.",
	"Maps your modules, database, and boot in a visual report.",
	"Extends with rules you write yourself.",
];
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
		return () => {
			video.removeEventListener("canplay", start);
			document.removeEventListener("visibilitychange", start);
		};
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
				The deterministic,{" "}
				<span className="font-normal text-nest-red">NestJS</span> devtool that{" "}
				<span className="font-normal text-nest-red">catches AI mistakes</span>
			</h1>
			<div className="mb-5 max-w-[66ch] space-y-1 text-[13px] text-white/[0.92] leading-relaxed">
				{POINTS.map((point) => (
					<p key={point}>{point}</p>
				))}
			</div>

			<CommandBlock command={COMMAND} />

			<p className="mt-5 inline-block border-white/15 border-t border-b py-2 font-bold text-[11px] text-white/[0.92] uppercase tracking-[0.08em]">
				your code never leaves · 0 AI calls · same output every run
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
