interface LeaderboardEntry {
	errorCount: number;
	fileCount: number;
	githubUrl: string;
	name: string;
	packageName: string;
	score: number;
	warningCount: number;
}

const buildShareUrl = (entry: LeaderboardEntry): string => {
	const searchParams = new URLSearchParams({
		p: entry.packageName,
		s: String(entry.score),
		e: String(entry.errorCount),
		w: String(entry.warningCount),
		f: String(entry.fileCount),
	});
	return `/share?${searchParams.toString()}`;
};

const RAW_ENTRIES: LeaderboardEntry[] = [
	{
		name: "nestjs/nest",
		githubUrl: "https://github.com/nestjs/nest",
		packageName: "@nestjs/core",
		score: 91,
		errorCount: 0,
		warningCount: 12,
		fileCount: 8,
	},
	{
		name: "ever-co/ever-gauzy",
		githubUrl: "https://github.com/ever-co/ever-gauzy",
		packageName: "ever-gauzy",
		score: 72,
		errorCount: 18,
		warningCount: 84,
		fileCount: 52,
	},
	{
		name: "rubiin/ultimate-nest",
		githubUrl: "https://github.com/rubiin/ultimate-nest",
		packageName: "ultimate-nest",
		score: 85,
		errorCount: 2,
		warningCount: 21,
		fileCount: 14,
	},
	{
		name: "brocoders/nestjs-boilerplate",
		githubUrl: "https://github.com/brocoders/nestjs-boilerplate",
		packageName: "nestjs-boilerplate",
		score: 78,
		errorCount: 5,
		warningCount: 34,
		fileCount: 22,
	},
	{
		name: "vendure-ecommerce/vendure",
		githubUrl: "https://github.com/vendure-ecommerce/vendure",
		packageName: "@vendure/core",
		score: 76,
		errorCount: 12,
		warningCount: 67,
		fileCount: 45,
	},
	{
		name: "medusajs/medusa",
		githubUrl: "https://github.com/medusajs/medusa",
		packageName: "@medusajs/medusa",
		score: 74,
		errorCount: 14,
		warningCount: 89,
		fileCount: 58,
	},
];

export interface ResolvedLeaderboardEntry extends LeaderboardEntry {
	shareUrl: string;
}

export const LEADERBOARD_ENTRIES: ResolvedLeaderboardEntry[] = RAW_ENTRIES.sort(
	(entryA, entryB) => entryB.score - entryA.score
).map((entry) => ({ ...entry, shareUrl: buildShareUrl(entry) }));
