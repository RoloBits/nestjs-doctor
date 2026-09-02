import { LEADERBOARD_ENTRIES } from "@/app/leaderboard/leaderboard-entries";

export interface EntryParams {
	owner: string;
	repo: string;
}

export const entryParams = (): EntryParams[] =>
	LEADERBOARD_ENTRIES.map((entry) => {
		const [owner, repo] = entry.name.split("/");
		return { owner, repo };
	});

export const findEntry = ({ owner, repo }: EntryParams) =>
	LEADERBOARD_ENTRIES.find((entry) => entry.name === `${owner}/${repo}`);
