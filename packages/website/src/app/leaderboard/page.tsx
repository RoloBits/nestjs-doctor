import type { Metadata } from "next";
import { Desktop } from "@/components/macos/desktop";
import { pageMetadata } from "@/lib/site";
import { LEADERBOARD_ENTRIES } from "./leaderboard-entries";
import { LeaderboardScreen } from "./leaderboard-screen";

export const metadata: Metadata = pageMetadata("/leaderboard", {
	title: "Leaderboard",
	description: `Health scores that nestjs-doctor measured for the ${LEADERBOARD_ENTRIES.length} most-starred open-source projects built on NestJS, one pinned commit each.`,
});

const WINDOW_TITLE = "nestjs-doctor — leaderboard";

const LeaderboardPage = () => (
	<div className="h-dvh w-full bg-[#0a0a0a] font-mono text-base text-neutral-300 leading-relaxed">
		<h1 className="sr-only">Leaderboard</h1>
		<p className="sr-only">
			{`Health scores for the ${LEADERBOARD_ENTRIES.length} most-starred open-source projects built on NestJS, each measured at one pinned commit.`}
		</p>
		<Desktop
			reopenLabel="Open leaderboard"
			section="Leaderboard"
			title={WINDOW_TITLE}
		>
			<LeaderboardScreen entries={LEADERBOARD_ENTRIES} />
		</Desktop>
	</div>
);

export default LeaderboardPage;
