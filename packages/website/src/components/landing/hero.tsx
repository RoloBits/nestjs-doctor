import { Desktop } from "@/components/macos/desktop";
import { CommandBlock } from "./command-block";
import { DemoTerminal } from "./demo/demo-terminal";
import { Figure } from "./primitives";

const COMMAND = "npx -y nestjs-doctor@latest .";

const POINTS = [
	"An opinionated rule set for an opinionated framework.",
	"A reviewer for your PRs.",
	"Maps your modules, database, and boot in a visual report.",
	"Extends with rules you write yourself.",
];

export const Hero = () => (
	<section className="grid flex-1 gap-12 border-white/15 border-b py-6 lg:grid-cols-[52fr_48fr]">
		<div className="self-center">
			<h1 className="mt-0 mb-4 text-balance font-extralight text-[#f2f1ef] text-[clamp(30px,3.4vw,46px)] leading-[1.08] tracking-[-0.02em]">
				The deterministic{" "}
				<span className="font-normal text-nest-red">NestJS</span> devtool that{" "}
				<span className="font-normal text-nest-red">catches AI mistakes</span>.
			</h1>
			<div className="mb-5 max-w-[66ch] space-y-1 text-[13px] text-white/[0.92] leading-relaxed">
				{POINTS.map((point) => (
					<p key={point}>{point}</p>
				))}
			</div>

			<CommandBlock command={COMMAND} />

			<p className="mt-5 inline-block border-white/15 border-t border-b py-2 font-bold text-[11px] text-white/[0.92] uppercase tracking-[0.08em]">
				your code never leaves your machine · 0 AI calls · same output every run
			</p>
		</div>

		<Figure
			caption="Fig. 01 — Examination recording"
			className="min-h-0 min-w-0 lg:self-center"
			meta={`$ ${COMMAND}`}
		>
			<Desktop
				className="h-[560px] lg:h-[clamp(400px,calc(100dvh_-_220px),720px)]"
				reopenLabel="Replay demo"
				section="Demo"
				stretch
				title="Terminal — nestjs-doctor"
			>
				<DemoTerminal />
			</Desktop>
			<div className="border-white/30 border-t px-4 py-2 font-bold text-[11px] text-white/75 uppercase tracking-[0.08em]">
				Replay · real scan, real findings · loops
			</div>
		</Figure>
	</section>
);
