"use client";

import { Check, ChevronRight, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const COPIED_RESET_DELAY_MS = 2000;
const INITIAL_DELAY_MS = 500;
const TYPING_DELAY_MS = 50;
const PROJECT_SCAN_DELAY_MS = 800;
const POST_HEADER_DELAY_MS = 600;
const DIAGNOSTIC_MIN_DELAY_MS = 150;
const DIAGNOSTIC_MAX_DELAY_MS = 350;
const SCORE_REVEAL_DELAY_MS = 600;
const SCORE_FRAME_COUNT = 20;
const SCORE_FRAME_DELAY_MS = 30;
const POST_SCORE_DELAY_MS = 700;
const TARGET_SCORE = 38;
const PERFECT_SCORE = 100;
const SCORE_BAR_WIDTH_MOBILE = 15;
const SCORE_BAR_WIDTH_DESKTOP = 30;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const DIAGNOSTIC_COUNT_MOBILE = 3;
const TOTAL_ERROR_COUNT = 21;
const AFFECTED_FILE_COUNT = 12;
const ELAPSED_TIME = "1.8s";

const CLAUDE_PROMPT_DELAY_MS = 800;
const CLAUDE_YES_DELAY_MS = 600;
const CLAUDE_POST_YES_DELAY_MS = 800;
const SKILL_FIX_MIN_DELAY_MS = 150;
const SKILL_FIX_MAX_DELAY_MS = 250;
const SKILL_POST_FIX_DELAY_MS = 600;
const FIXED_SCORE = 92;

const COMMAND = "npx -y nestjs-doctor@latest .";
const GITHUB_URL = "https://github.com/RoloBits/nestjs-doctor";
const GITHUB_ICON_PATH =
	"M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z";

interface FileLocation {
	lines: number[];
	path: string;
}

interface Diagnostic {
	count: number;
	files: FileLocation[];
	message: string;
}

const DIAGNOSTICS: Diagnostic[] = [
	{
		message: "Controller injects ORM 'PrismaService' directly",
		count: 3,
		files: [
			{ path: "src/users/users.controller.ts", lines: [12] },
			{ path: "src/orders/orders.controller.ts", lines: [15, 28] },
		],
	},
	{
		message: "TypeORM 'synchronize: true' risks data loss in production",
		count: 1,
		files: [{ path: "src/config/database.config.ts", lines: [18] }],
	},
	{
		message: "Circular dependency detected",
		count: 2,
		files: [
			{ path: "src/auth/auth.module.ts", lines: [14] },
			{ path: "src/users/users.module.ts", lines: [11] },
		],
	},
	{
		message: "Hardcoded JWT secret",
		count: 1,
		files: [{ path: "src/auth/auth.service.ts", lines: [34] }],
	},
	{
		message: "Controller contains business logic",
		count: 4,
		files: [
			{ path: "src/orders/orders.controller.ts", lines: [42, 67, 89] },
			{ path: "src/users/users.controller.ts", lines: [55] },
		],
	},
	{
		message: "Injected dependency should be readonly",
		count: 8,
		files: [
			{ path: "src/orders/orders.service.ts", lines: [10, 11] },
			{ path: "src/users/users.service.ts", lines: [9, 10, 11] },
			{ path: "src/auth/auth.service.ts", lines: [8, 9, 10] },
		],
	},
	{
		message: "Manual instantiation, should use DI",
		count: 2,
		files: [
			{ path: "src/notifications/notification.service.ts", lines: [22] },
			{ path: "src/common/logger.service.ts", lines: [15] },
		],
	},
];

const getScoreColor = (score: number) => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "text-green-400";
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return "text-yellow-500";
	}
	return "text-red-400";
};

const getScoreLabel = (score: number) => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "Great";
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return "Needs work";
	}
	return "Critical";
};

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

const sleep = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const Spacer = () => <div className="min-h-[1.4em]" />;

const FadeIn = ({ children }: { children: React.ReactNode }) => (
	<div className="animate-fade-in">{children}</div>
);

const getNestBirds = (score: number): [string, string] => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return ["\u25E0 \u25E0 \u25E0", "\u2570\u2500\u2500\u2500\u256F"];
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return ["\u2022 \u2022 \u2022", "\u2570\u2500\u2500\u2500\u256F"];
	}
	return ["x x x", "\u2570\u2500\u2500\u2500\u256F"];
};

const BOX_TOP = "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510";
const BOX_BOTTOM = "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518";

const NestBranding = ({ score }: { score: number }) => {
	const [eyes, mouth] = getNestBirds(score);
	const colorClass = getScoreColor(score);

	return (
		<div>
			<pre
				className={`${colorClass} leading-tight transition-colors duration-500`}
			>
				{`  ${BOX_TOP}\n  \u2502 ${eyes} \u2502\n  \u2502 ${mouth} \u2502\n  ${BOX_BOTTOM}`}
			</pre>
		</div>
	);
};

const ScoreBar = ({ score, barWidth }: { score: number; barWidth: number }) => {
	const filledCount = Math.round((score / PERFECT_SCORE) * barWidth);
	const emptyCount = barWidth - filledCount;
	const colorClass = getScoreColor(score);

	return (
		<>
			<span className={colorClass}>{"\u2588".repeat(filledCount)}</span>
			<span className="text-neutral-600">{"\u2591".repeat(emptyCount)}</span>
		</>
	);
};

const ScoreGauge = ({ score }: { score: number }) => {
	const colorClass = getScoreColor(score);

	return (
		<div className="pl-2">
			<div>
				<span className={`${colorClass} transition-colors duration-500`}>
					{score}
				</span>
				{` / ${PERFECT_SCORE}  `}
				<span className={`${colorClass} transition-colors duration-500`}>
					{getScoreLabel(score)}
				</span>
			</div>
			<div className="my-1 text-xs sm:text-sm">
				<span className="sm:hidden">
					<ScoreBar barWidth={SCORE_BAR_WIDTH_MOBILE} score={score} />
				</span>
				<span className="hidden sm:inline">
					<ScoreBar barWidth={SCORE_BAR_WIDTH_DESKTOP} score={score} />
				</span>
			</div>
		</div>
	);
};

const CopyCommand = () => {
	const [didCopy, setDidCopy] = useState(false);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(COMMAND);
		setDidCopy(true);
		setTimeout(() => setDidCopy(false), COPIED_RESET_DELAY_MS);
	}, []);

	const IconComponent = didCopy ? Check : Copy;
	const iconClass = didCopy
		? "shrink-0 text-green-400"
		: "shrink-0 text-white/50 transition-colors group-hover:text-white";

	return (
		<div className="group flex items-center gap-4 border border-white/20 px-3 py-1.5 transition-colors hover:bg-white/5">
			<span className="select-all whitespace-nowrap text-white">{COMMAND}</span>
			<button onClick={handleCopy} type="button">
				<IconComponent className={iconClass} size={16} />
			</button>
		</div>
	);
};

const DiagnosticItem = ({
	diagnostic,
	isFixed,
}: {
	diagnostic: Diagnostic;
	isFixed: boolean;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const icon = isFixed ? "\u2713" : "\u2717";
	const iconColor = isFixed ? "text-green-400" : "text-red-400";
	const textClass = isFixed
		? "line-through text-neutral-500 transition-all duration-300"
		: "transition-all duration-300";

	return (
		<div className="mb-1">
			<div className="sm:hidden">
				<span className={`${iconColor} transition-colors duration-300`}>
					{" "}
					{icon}
				</span>
				<span className={textClass}>
					{` ${diagnostic.message} `}
					<span className="text-neutral-500">({diagnostic.count})</span>
				</span>
			</div>
			<div className="hidden sm:block">
				<button
					className="inline-flex items-start gap-1 text-left"
					onClick={() => setIsOpen((previous) => !previous)}
					type="button"
				>
					<ChevronRight
						className={`mt-[0.35em] shrink-0 text-neutral-500 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
						size={16}
					/>
					<span>
						<span className={`${iconColor} transition-colors duration-300`}>
							{icon}
						</span>
						<span className={textClass}>
							{` ${diagnostic.message} `}
							<span className="text-neutral-500">({diagnostic.count})</span>
						</span>
					</span>
				</button>
				<div
					className="ml-6 grid text-neutral-500 text-sm transition-[grid-template-rows,opacity] duration-200 ease-out sm:text-base"
					style={{
						gridTemplateRows: isOpen ? "1fr" : "0fr",
						opacity: isOpen ? 1 : 0,
					}}
				>
					<div className="overflow-hidden">
						<div className="mt-1">
							{diagnostic.files.map((file) => (
								<div key={file.path}>
									{file.path}
									{file.lines.length > 0 && `: ${file.lines.join(", ")}`}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

interface AnimationState {
	fixedDiagnosticCount: number;
	fixedScore: number | null;
	isTyping: boolean;
	score: number | null;
	showClaudePrompt: boolean;
	showClaudeYes: boolean;
	showHeader: boolean;
	showSeparator: boolean;
	showSummary: boolean;
	skillStep: number;
	typedCommand: string;
	visibleDiagnosticCount: number;
}

const INITIAL_STATE: AnimationState = {
	fixedDiagnosticCount: 0,
	fixedScore: null,
	isTyping: true,
	score: null,
	showClaudePrompt: false,
	showClaudeYes: false,
	showHeader: false,
	showSeparator: false,
	showSummary: false,
	skillStep: 0,
	typedCommand: "",
	visibleDiagnosticCount: 0,
};

const Terminal = () => {
	const [state, setState] = useState<AnimationState>(INITIAL_STATE);

	useEffect(() => {
		let cancelled = false;

		const update = (patch: Partial<AnimationState>) => {
			if (!cancelled) {
				setState((previous) => ({ ...previous, ...patch }));
			}
		};

		const run = async () => {
			await sleep(INITIAL_DELAY_MS);

			for (let index = 0; index <= COMMAND.length; index++) {
				if (cancelled) {
					return;
				}
				update({ typedCommand: COMMAND.slice(0, index) });
				await sleep(TYPING_DELAY_MS);
			}

			update({ isTyping: false });
			await sleep(PROJECT_SCAN_DELAY_MS);
			if (cancelled) {
				return;
			}

			update({ showHeader: true });
			await sleep(POST_HEADER_DELAY_MS);

			for (let index = 0; index < DIAGNOSTICS.length; index++) {
				if (cancelled) {
					return;
				}
				update({ visibleDiagnosticCount: index + 1 });
				const jitteredDelay =
					DIAGNOSTIC_MIN_DELAY_MS +
					Math.random() * (DIAGNOSTIC_MAX_DELAY_MS - DIAGNOSTIC_MIN_DELAY_MS);
				await sleep(jitteredDelay);
			}

			update({ showSeparator: true });
			await sleep(SCORE_REVEAL_DELAY_MS);

			for (let frame = 0; frame <= SCORE_FRAME_COUNT; frame++) {
				if (cancelled) {
					return;
				}
				update({
					score: Math.round(
						easeOutCubic(frame / SCORE_FRAME_COUNT) * TARGET_SCORE
					),
				});
				await sleep(SCORE_FRAME_DELAY_MS);
			}

			await sleep(POST_SCORE_DELAY_MS);
			if (cancelled) {
				return;
			}
			update({ showSummary: true });

			// Claude prompt phase
			await sleep(CLAUDE_PROMPT_DELAY_MS);
			if (cancelled) {
				return;
			}
			update({ showClaudePrompt: true });
			await sleep(CLAUDE_YES_DELAY_MS);
			if (cancelled) {
				return;
			}
			update({ showClaudeYes: true });
			await sleep(CLAUDE_POST_YES_DELAY_MS);

			for (let index = 0; index < DIAGNOSTICS.length; index++) {
				if (cancelled) {
					return;
				}
				update({ fixedDiagnosticCount: index + 1 });
				const jitteredDelay =
					SKILL_FIX_MIN_DELAY_MS +
					Math.random() * (SKILL_FIX_MAX_DELAY_MS - SKILL_FIX_MIN_DELAY_MS);
				await sleep(jitteredDelay);
			}

			// Animate score from TARGET_SCORE to FIXED_SCORE in-place
			await sleep(SKILL_POST_FIX_DELAY_MS);
			for (let frame = 0; frame <= SCORE_FRAME_COUNT; frame++) {
				if (cancelled) {
					return;
				}
				const progress = easeOutCubic(frame / SCORE_FRAME_COUNT);
				const animatedScore = Math.round(
					TARGET_SCORE + progress * (FIXED_SCORE - TARGET_SCORE)
				);
				update({ fixedScore: animatedScore });
				await sleep(SCORE_FRAME_DELAY_MS);
			}

			// Show final state
			await sleep(POST_SCORE_DELAY_MS);
			if (cancelled) {
				return;
			}
			update({ skillStep: 4 });
		};

		run();
		return () => {
			cancelled = true;
		};
	}, []);

	const displayScore = state.fixedScore ?? state.score;

	return (
		<div className="mx-auto min-h-screen w-full max-w-3xl bg-[#0a0a0a] p-6 pb-32 font-mono text-base text-neutral-300 leading-relaxed sm:p-8 sm:pb-40 sm:text-lg">
			<div>
				<span className="text-neutral-500">$ </span>
				<span>{state.typedCommand}</span>
				{state.isTyping && <span>{"\u258B"}</span>}
			</div>

			{state.showHeader && (
				<FadeIn>
					<Spacer />
					<div>nestjs-doctor</div>
					<div className="text-neutral-500">
						Diagnose and fix your NestJS code in one command.
					</div>
					<Spacer />
				</FadeIn>
			)}

			<div className="sm:hidden">
				{DIAGNOSTICS.slice(
					0,
					Math.min(state.visibleDiagnosticCount, DIAGNOSTIC_COUNT_MOBILE)
				).map((diagnostic, index) => (
					<FadeIn key={diagnostic.message}>
						<DiagnosticItem
							diagnostic={diagnostic}
							isFixed={index < state.fixedDiagnosticCount}
						/>
					</FadeIn>
				))}
			</div>
			<div className="hidden sm:block">
				{DIAGNOSTICS.slice(0, state.visibleDiagnosticCount).map(
					(diagnostic, index) => (
						<FadeIn key={diagnostic.message}>
							<DiagnosticItem
								diagnostic={diagnostic}
								isFixed={index < state.fixedDiagnosticCount}
							/>
						</FadeIn>
					)
				)}
			</div>

			{state.showSeparator && <Spacer />}

			{displayScore !== null && (
				<FadeIn>
					<NestBranding score={displayScore} />
					<Spacer />
					<ScoreGauge score={displayScore} />
				</FadeIn>
			)}

			{state.showSummary && (
				<FadeIn>
					<Spacer />
					<div>
						{state.skillStep >= 4 ? (
							<span className="text-green-400">0 errors</span>
						) : (
							<span className="text-red-400">{TOTAL_ERROR_COUNT} errors</span>
						)}
						<span className="text-neutral-500">
							{`  across ${AFFECTED_FILE_COUNT} files  in ${ELAPSED_TIME}`}
						</span>
					</div>
				</FadeIn>
			)}

			{state.showClaudePrompt && (
				<FadeIn>
					<Spacer />
					<div>
						<span className="text-purple-400">{"claude >"}</span>
						{" Fix these errors?"}
					</div>
					{state.showClaudeYes && (
						<FadeIn>
							<div className="mt-1">
								<span className="text-purple-400">{">"}</span>
								{" Yes"}
							</div>
						</FadeIn>
					)}
				</FadeIn>
			)}

			{state.skillStep >= 4 && (
				<FadeIn>
					<Spacer />
					<div className="text-neutral-500">
						Run it on your codebase to find issues like these:
					</div>
					<Spacer />
					<div className="flex flex-wrap items-center gap-3">
						<CopyCommand />
						<a
							className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-white/20 bg-white px-3 py-1.5 text-black transition-all hover:bg-white/90 active:scale-[0.98]"
							href="/docs"
						>
							<svg
								aria-label="Docs"
								fill="none"
								height="18"
								role="img"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
								viewBox="0 0 24 24"
								width="18"
							>
								<title>Docs</title>
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
							</svg>
							Docs
						</a>
						<a
							className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-white/20 bg-white px-3 py-1.5 text-black transition-all hover:bg-white/90 active:scale-[0.98]"
							href={GITHUB_URL}
							rel="noreferrer"
							target="_blank"
						>
							<svg
								aria-label="GitHub"
								fill="currentColor"
								height="18"
								role="img"
								viewBox="0 0 24 24"
								width="18"
							>
								<title>GitHub</title>
								<path
									clipRule="evenodd"
									d={GITHUB_ICON_PATH}
									fillRule="evenodd"
								/>
							</svg>
							Star on GitHub
						</a>
					</div>
				</FadeIn>
			)}
		</div>
	);
};

export default Terminal;
