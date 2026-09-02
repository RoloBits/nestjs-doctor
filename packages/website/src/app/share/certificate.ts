import {
	type ResolvedLeaderboardEntry,
	SCANNED_WITH,
} from "@/app/leaderboard/leaderboard-entries";
import { PERFECT_SCORE } from "@/lib/tui-theme";

const SHORT_COMMIT_LENGTH = 7;

/** One certificate's facts. Null means the source carried no usable value. */
export interface CertificateValues {
	commit: string | null;
	errorCount: number | null;
	fileCount: number | null;
	infoCount: number | null;
	moduleCount: number | null;
	nestVersion: string | null;
	orm: string | null;
	packageName: string | null;
	repoName: string | null;
	scanDate: string | null;
	score: number | null;
	/** The site-relative path this certificate re-shares. */
	sharePath: string;
	toolVersion: string | null;
	warningCount: number | null;
}

export const certificateFromEntry = (
	entry: ResolvedLeaderboardEntry
): CertificateValues => ({
	commit: entry.commit ? entry.commit.slice(0, SHORT_COMMIT_LENGTH) : null,
	errorCount: entry.errorCount,
	fileCount: entry.fileCount,
	infoCount: entry.infoCount ?? null,
	moduleCount: entry.moduleCount ?? null,
	nestVersion: entry.nestVersion ?? null,
	orm: entry.orm ?? null,
	packageName: entry.packageName,
	repoName: entry.name,
	scanDate: entry.scannedAt,
	score: entry.score,
	sharePath: entry.shareUrl,
	toolVersion: SCANNED_WITH,
	warningCount: entry.warningCount,
});

const parseCount = (value: string | null): number | null => {
	if (value === null) {
		return null;
	}
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

/** Reads a certificate from a query string, keeping only values that parse. */
export const certificateFromQuery = (
	get: (key: string) => string | null
): CertificateValues => {
	const raw = (key: string): string | null => get(key)?.trim() || null;
	const parsedScore = parseCount(raw("s"));
	const values = {
		packageName: raw("p"),
		score: parsedScore === null ? null : Math.min(PERFECT_SCORE, parsedScore),
		errorCount: parseCount(raw("e")),
		warningCount: parseCount(raw("w")),
		fileCount: parseCount(raw("f")),
		infoCount: parseCount(raw("i")),
		moduleCount: parseCount(raw("m")),
		nestVersion: raw("n"),
		orm: raw("o"),
		commit: raw("c"),
		scanDate: raw("d"),
		toolVersion: raw("v"),
		repoName: raw("r"),
	};
	const query = new URLSearchParams();
	const keys: [string, keyof typeof values][] = [
		["p", "packageName"],
		["s", "score"],
		["e", "errorCount"],
		["w", "warningCount"],
		["f", "fileCount"],
		["i", "infoCount"],
		["m", "moduleCount"],
		["n", "nestVersion"],
		["o", "orm"],
		["c", "commit"],
		["d", "scanDate"],
		["v", "toolVersion"],
		["r", "repoName"],
	];
	for (const [key, field] of keys) {
		const value = values[field];
		if (value !== null) {
			query.set(key, String(value));
		}
	}
	const search = query.toString();
	return { ...values, sharePath: search ? `/share?${search}` : "/share" };
};

export const certificateTitle = (values: CertificateValues): string =>
	values.repoName ?? values.packageName ?? "Your NestJS codebase";
