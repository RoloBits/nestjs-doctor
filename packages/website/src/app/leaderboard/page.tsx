import type { Metadata } from "next";
import Link from "next/link";
import {
	LEADERBOARD_ENTRIES,
	type ResolvedLeaderboardEntry,
} from "./leaderboard-entries";

const PERFECT_SCORE = 100;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const SCORE_BAR_WIDTH = 20;
const COMMAND = "npx -y nestjs-doctor@latest .";
const CONTRIBUTE_URL =
	"https://github.com/RoloBits/nestjs-doctor/edit/main/packages/website/src/app/leaderboard/leaderboard-entries.ts";

const getScoreColorClass = (score: number): string => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return "text-green-400";
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return "text-yellow-500";
	}
	return "text-red-400";
};

const getNestBirds = (score: number): [string, string] => {
	if (score >= SCORE_GOOD_THRESHOLD) {
		return ["\u25E0 \u25E0 \u25E0", "\u2570\u2500\u2500\u2500\u256F"];
	}
	if (score >= SCORE_OK_THRESHOLD) {
		return ["\u2022 \u2022 \u2022", "\u2570\u2500\u2500\u2500\u256F"];
	}
	return ["x x x", "\u2570\u2500\u2500\u2500\u256F"];
};

const ScoreBar = ({ score }: { score: number }) => {
	const filledCount = Math.round((score / PERFECT_SCORE) * SCORE_BAR_WIDTH);
	const emptyCount = SCORE_BAR_WIDTH - filledCount;
	const colorClass = getScoreColorClass(score);

	return (
		<span className="text-xs sm:text-sm">
			<span className={colorClass}>{"\u2588".repeat(filledCount)}</span>
			<span className="text-neutral-700">{"\u2591".repeat(emptyCount)}</span>
		</span>
	);
};

const LeaderboardRow = ({
	entry,
	rank,
}: {
	entry: ResolvedLeaderboardEntry;
	rank: number;
}) => {
	const colorClass = getScoreColorClass(entry.score);

	return (
		<div className="group grid grid-cols-[2rem_1fr_auto] items-center border-white/5 border-b py-2 transition-colors hover:bg-white/2 sm:grid-cols-[2.5rem_7rem_1fr_auto] sm:py-2.5">
			<span className="text-right text-neutral-600">{rank}</span>

			<a
				className="ml-2 truncate text-white transition-colors hover:text-blue-400 sm:ml-4"
				href={entry.githubUrl}
				rel="noreferrer"
				target="_blank"
			>
				{entry.name}
			</a>

			<span className="hidden sm:inline">
				<ScoreBar score={entry.score} />
			</span>

			<Link
				className="ml-4 text-right transition-colors hover:underline"
				href={entry.shareUrl}
			>
				<span className={`${colorClass} font-medium`}>{entry.score}</span>
				<span className="text-neutral-600">/{PERFECT_SCORE}</span>
			</Link>
		</div>
	);
};

export const metadata: Metadata = {
	title: "Leaderboard - NestJS Doctor",
	description:
		"Scores for popular open-source NestJS projects, diagnosed by NestJS Doctor.",
};

const LeaderboardPage = () => {
	const topScore = LEADERBOARD_ENTRIES[0]?.score ?? 0;
	const [eyes, mouth] = getNestBirds(topScore);
	const topScoreColor = getScoreColorClass(topScore);

	return (
		<div className="mx-auto min-h-screen w-full max-w-3xl bg-[#0a0a0a] p-6 pb-32 font-mono text-base text-neutral-300 leading-relaxed sm:p-8 sm:pb-40 sm:text-lg">
			<div className="mb-8">
				<Link
					className="inline-flex items-center gap-2 text-neutral-500 transition-colors hover:text-neutral-300"
					href="/"
				>
					<span>nestjs-doctor</span>
				</Link>
			</div>

			<div className="mb-2">
				<pre className={`${topScoreColor} leading-tight`}>
					{`  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n  \u2502 ${eyes} \u2502\n  \u2502 ${mouth} \u2502\n  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`}
				</pre>
			</div>

			<div className="mb-1 text-white text-xl">Leaderboard</div>
			<div className="mb-8 text-neutral-500">
				Scores for popular open-source NestJS projects.
			</div>

			<div className="mb-8">
				{LEADERBOARD_ENTRIES.map((entry, index) => (
					<LeaderboardRow entry={entry} key={entry.name} rank={index + 1} />
				))}
			</div>

			<div className="min-h-[1.4em]" />

			<div className="text-neutral-500">Run it on your codebase:</div>
			<div className="mt-2">
				<span className="border border-white/20 px-3 py-1.5 text-white">
					{COMMAND}
				</span>
			</div>

			<div className="min-h-[1.4em]" />
			<div className="min-h-[1.4em]" />

			<div className="text-neutral-500">
				{"+ "}
				<a
					className="text-green-400 transition-colors hover:text-green-300 hover:underline"
					href={CONTRIBUTE_URL}
					rel="noreferrer"
					target="_blank"
				>
					Add your project
				</a>
				<span className="text-neutral-600">
					{" \u2014 open a PR to leaderboard-entries.ts"}
				</span>
			</div>
		</div>
	);
};

export default LeaderboardPage;
