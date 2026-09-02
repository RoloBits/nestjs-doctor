export interface TopRule {
	count: number;
	rule: string;
	severity: "error" | "info" | "warning";
}

interface LeaderboardEntry {
	commit: string;
	errorCount: number;
	fileCount: number;
	githubUrl: string;
	infoCount?: number;
	kind?: "app" | "starter";
	moduleCount?: number;
	name: string;
	nestMajor: number;
	nestVersion?: string;
	orm?: string;
	packageName: string;
	scannedAt: string;
	score: number;
	stars?: number;
	topRules?: TopRule[];
	upgradedTo?: 12;
	warningCount: number;
}

export const SCANNED_WITH = "0.9.5";
export const SCANNED_AT = "2026-09-02";

const SHORT_COMMIT_LENGTH = 7;

/** Builds the certificate URL from the scan facts and the scan stamp. */
const buildShareUrl = (entry: LeaderboardEntry): string => {
	const searchParams = new URLSearchParams({
		p: entry.packageName,
		s: String(entry.score),
		e: String(entry.errorCount),
		w: String(entry.warningCount),
		f: String(entry.fileCount),
		d: entry.scannedAt,
		v: SCANNED_WITH,
		r: entry.name,
	});
	if (entry.infoCount !== undefined) {
		searchParams.set("i", String(entry.infoCount));
	}
	if (entry.moduleCount !== undefined) {
		searchParams.set("m", String(entry.moduleCount));
	}
	if (entry.nestVersion) {
		searchParams.set("n", entry.nestVersion);
	}
	if (entry.orm) {
		searchParams.set("o", entry.orm);
	}
	if (entry.commit) {
		searchParams.set("c", entry.commit.slice(0, SHORT_COMMIT_LENGTH));
	}
	return `/share?${searchParams.toString()}`;
};

const RAW_ENTRIES: LeaderboardEntry[] = [
	{
		name: "twentyhq/twenty",
		githubUrl: "https://github.com/twentyhq/twenty",
		packageName: "twenty-server",
		kind: "app",
		stars: 56_040,
		score: 99,
		errorCount: 53,
		warningCount: 1105,
		infoCount: 402,
		fileCount: 6994,
		moduleCount: 381,
		nestMajor: 11,
		nestVersion: "11.2.1",
		orm: "typeorm",
		topRules: [
			{
				rule: "architecture/no-orm-in-controllers",
				severity: "error",
				count: 20,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 11 },
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 10,
			},
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 8,
			},
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 2,
			},
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 1,
			},
		],
		scannedAt: "2026-09-02",
		commit: "57545214e58c8d181f7855da333de447f887e032",
	},
	{
		name: "amplication/amplication",
		githubUrl: "https://github.com/amplication/amplication",
		packageName: "amplication",
		kind: "app",
		stars: 16_012,
		score: 98,
		errorCount: 22,
		warningCount: 320,
		infoCount: 244,
		fileCount: 1655,
		moduleCount: 124,
		nestMajor: 9,
		nestVersion: "9.3.12",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 17,
			},
			{
				rule: "correctness/param-decorator-matches-route",
				severity: "error",
				count: 4,
			},
			{
				rule: "security/no-vulnerable-nestjs-packages",
				severity: "error",
				count: 1,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 218,
			},
			{
				rule: "security/require-guards-on-endpoints",
				severity: "warning",
				count: 37,
			},
			{
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				count: 24,
			},
		],
		scannedAt: "2026-09-02",
		commit: "7656495d27f0dceff89657590c3f14149e45c7a6",
	},
	{
		name: "ever-co/ever-gauzy",
		githubUrl: "https://github.com/ever-co/ever-gauzy",
		packageName: "ever-gauzy",
		kind: "app",
		stars: 4359,
		score: 98,
		errorCount: 77,
		warningCount: 1193,
		infoCount: 563,
		fileCount: 3751,
		moduleCount: 217,
		nestMajor: 11,
		nestVersion: "11.1.26",
		orm: "typeorm",
		topRules: [
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 35 },
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 31,
			},
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 4,
			},
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 3,
			},
			{ rule: "security/no-eval", severity: "error", count: 2 },
			{
				rule: "security/no-synchronize-in-production",
				severity: "error",
				count: 1,
			},
		],
		scannedAt: "2026-09-02",
		commit: "fe004fe999272d495d7e33636d5b53495e2749be",
	},
	{
		name: "bookorbit/bookorbit",
		githubUrl: "https://github.com/bookorbit/bookorbit",
		packageName: "server",
		kind: "app",
		stars: 3736,
		score: 98,
		errorCount: 24,
		warningCount: 403,
		infoCount: 69,
		fileCount: 1125,
		moduleCount: 72,
		nestMajor: 11,
		nestVersion: "11.2.3",
		orm: "drizzle",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 11,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 4 },
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 4,
			},
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 2,
			},
			{ rule: "security/no-eval", severity: "error", count: 1 },
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 1,
			},
		],
		scannedAt: "2026-09-02",
		commit: "9165dbed1dd9b30b075d74c8a718a1a4673f7e95",
	},
	{
		name: "immich-app/immich",
		githubUrl: "https://github.com/immich-app/immich",
		packageName: "immich",
		kind: "app",
		stars: 113_268,
		score: 97,
		errorCount: 27,
		warningCount: 350,
		infoCount: 1,
		fileCount: 443,
		moduleCount: 4,
		nestMajor: 11,
		nestVersion: "11.0.4",
		topRules: [
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 19,
			},
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 6,
			},
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 1,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 1 },
			{
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				count: 212,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 95,
			},
		],
		scannedAt: "2026-09-02",
		commit: "2c53b76400e95c4e30571e87f85de83b0620ef01",
	},
	{
		name: "ghostfolio/ghostfolio",
		githubUrl: "https://github.com/ghostfolio/ghostfolio",
		packageName: "ghostfolio",
		kind: "app",
		stars: 9232,
		score: 97,
		errorCount: 15,
		warningCount: 105,
		infoCount: 23,
		fileCount: 292,
		moduleCount: 63,
		nestMajor: 11,
		nestVersion: "11.1.28",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 10,
			},
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 3,
			},
			{ rule: "security/no-eval", severity: "error", count: 1 },
			{
				rule: "architecture/no-orm-in-controllers",
				severity: "error",
				count: 1,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 83,
			},
			{ rule: "performance/no-sync-io", severity: "warning", count: 7 },
		],
		scannedAt: "2026-09-02",
		commit: "73e4f0368de398d7b67c50fb2926351414e2044e",
	},
	{
		name: "brocoders/nestjs-boilerplate",
		githubUrl: "https://github.com/brocoders/nestjs-boilerplate",
		packageName: "nestjs-boilerplate",
		kind: "starter",
		stars: 4384,
		score: 96,
		errorCount: 1,
		warningCount: 19,
		infoCount: 48,
		fileCount: 157,
		moduleCount: 24,
		nestMajor: 11,
		nestVersion: "11.1.18",
		orm: "typeorm",
		upgradedTo: 12,
		topRules: [
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 1 },
			{
				rule: "security/require-guards-on-endpoints",
				severity: "warning",
				count: 11,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 3,
			},
			{
				rule: "correctness/validated-non-primitive-needs-type",
				severity: "warning",
				count: 3,
			},
			{
				rule: "performance/no-unused-providers",
				severity: "warning",
				count: 2,
			},
			{
				rule: "architecture/require-module-boundaries",
				severity: "info",
				count: 17,
			},
		],
		scannedAt: "2026-09-02",
		commit: "9620f159eefe38f47747d02ab162852367c5472c",
	},
	{
		name: "toeverything/AFFiNE",
		githubUrl: "https://github.com/toeverything/AFFiNE",
		packageName: "@affine/server",
		kind: "app",
		stars: 72_118,
		score: 95,
		errorCount: 17,
		warningCount: 219,
		infoCount: 130,
		fileCount: 528,
		moduleCount: 69,
		nestMajor: 11,
		nestVersion: "11.1.18",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 14,
			},
			{
				rule: "architecture/no-orm-in-controllers",
				severity: "error",
				count: 2,
			},
			{ rule: "schema/require-primary-key", severity: "error", count: 1 },
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 125,
			},
			{
				rule: "performance/no-unused-providers",
				severity: "warning",
				count: 53,
			},
			{ rule: "performance/no-sync-io", severity: "warning", count: 11 },
		],
		scannedAt: "2026-09-02",
		commit: "f78e46f90e112f33df063b97cd38f636dfc5b212",
	},
	{
		name: "nocodb/nocodb",
		githubUrl: "https://github.com/nocodb/nocodb",
		packageName: "nocodb",
		kind: "app",
		stars: 64_805,
		score: 95,
		errorCount: 55,
		warningCount: 1005,
		infoCount: 157,
		fileCount: 1197,
		moduleCount: 7,
		nestMajor: 10,
		nestVersion: "10.4.19",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 27,
			},
			{
				rule: "correctness/param-decorator-matches-route",
				severity: "error",
				count: 13,
			},
			{
				rule: "correctness/require-inject-decorator",
				severity: "error",
				count: 11,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 3 },
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 1,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 747,
			},
		],
		scannedAt: "2026-09-02",
		commit: "fb10b70be62c98ae90dd01af2d1ebbccf4f92cb9",
	},
	{
		name: "novuhq/novu",
		githubUrl: "https://github.com/novuhq/novu",
		packageName: "@novu/api-service",
		kind: "app",
		stars: 39_710,
		score: 95,
		errorCount: 82,
		warningCount: 2758,
		infoCount: 691,
		fileCount: 3454,
		moduleCount: 81,
		nestMajor: 11,
		nestVersion: "11.1.27",
		orm: "mongoose",
		topRules: [
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 52 },
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 12,
			},
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 11,
			},
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 4,
			},
			{
				rule: "correctness/no-missing-interceptor-method",
				severity: "error",
				count: 2,
			},
			{ rule: "security/no-eval", severity: "error", count: 1 },
		],
		scannedAt: "2026-09-02",
		commit: "cfc272c0dcb662badfe8d1f92225afb796280e98",
	},
	{
		name: "vendurehq/vendure",
		githubUrl: "https://github.com/vendurehq/vendure",
		packageName: "@vendure/core",
		kind: "app",
		stars: 8394,
		score: 95,
		errorCount: 79,
		warningCount: 590,
		infoCount: 107,
		fileCount: 741,
		moduleCount: 22,
		nestMajor: 11,
		nestVersion: "11.0.12",
		orm: "typeorm",
		topRules: [
			{ rule: "schema/require-primary-key", severity: "error", count: 78 },
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 1,
			},
			{
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				count: 447,
			},
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 105,
			},
			{ rule: "performance/no-sync-io", severity: "warning", count: 17 },
			{
				rule: "correctness/no-fire-and-forget-async",
				severity: "warning",
				count: 4,
			},
		],
		scannedAt: "2026-09-02",
		commit: "1ad4ba80d1d30060f459e74d95bd7faf6a1d14f2",
	},
	{
		name: "hoppscotch/hoppscotch",
		githubUrl: "https://github.com/hoppscotch/hoppscotch",
		packageName: "hoppscotch-backend",
		kind: "app",
		stars: 80_163,
		score: 92,
		errorCount: 11,
		warningCount: 102,
		infoCount: 21,
		fileCount: 189,
		moduleCount: 26,
		nestMajor: 11,
		nestVersion: "11.2.1",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 7,
			},
			{ rule: "schema/require-primary-key", severity: "error", count: 2 },
			{
				rule: "architecture/no-orm-in-controllers",
				severity: "error",
				count: 1,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 1 },
			{
				rule: "correctness/no-fire-and-forget-async",
				severity: "warning",
				count: 53,
			},
			{
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				count: 23,
			},
		],
		scannedAt: "2026-09-02",
		commit: "ac145e7f758151b41fd46d3e5f513886ce9068ba",
	},
	{
		name: "apitable/apitable",
		githubUrl: "https://github.com/apitable/apitable",
		packageName: "@apitable/room-server",
		kind: "app",
		stars: 15_584,
		score: 91,
		errorCount: 34,
		warningCount: 218,
		infoCount: 40,
		fileCount: 535,
		moduleCount: 47,
		nestMajor: 8,
		nestVersion: "8.1.2",
		orm: "typeorm",
		topRules: [
			{
				rule: "architecture/no-repository-in-controllers",
				severity: "error",
				count: 12,
			},
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 9,
			},
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 6,
			},
			{
				rule: "security/no-vulnerable-nestjs-packages",
				severity: "error",
				count: 4,
			},
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 2,
			},
			{ rule: "security/no-hardcoded-secrets", severity: "error", count: 1 },
		],
		scannedAt: "2026-09-02",
		commit: "88b24ce9f359cc434778be75d03603182882dc76",
	},
	{
		name: "gitroomhq/postiz-app",
		githubUrl: "https://github.com/gitroomhq/postiz-app",
		packageName: "gitroom",
		kind: "app",
		stars: 35_391,
		score: 89,
		errorCount: 28,
		warningCount: 613,
		infoCount: 69,
		fileCount: 396,
		moduleCount: 12,
		nestMajor: 11,
		nestVersion: "11.1.21",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 25,
			},
			{ rule: "schema/require-primary-key", severity: "error", count: 3 },
			{
				rule: "correctness/no-async-without-await",
				severity: "warning",
				count: 242,
			},
			{
				rule: "correctness/prefer-readonly-injection",
				severity: "warning",
				count: 210,
			},
			{ rule: "security/no-exposed-env-vars", severity: "warning", count: 116 },
			{
				rule: "performance/no-unused-providers",
				severity: "warning",
				count: 26,
			},
		],
		scannedAt: "2026-09-02",
		commit: "ec162d2ac19f7ec736d2ead907369d4b8d12f274",
	},
	{
		name: "teableio/teable",
		githubUrl: "https://github.com/teableio/teable",
		packageName: "@teable/backend",
		kind: "app",
		stars: 21_750,
		score: 89,
		errorCount: 32,
		warningCount: 702,
		infoCount: 178,
		fileCount: 921,
		moduleCount: 130,
		nestMajor: 10,
		nestVersion: "10.3.5",
		orm: "prisma",
		topRules: [
			{
				rule: "architecture/no-business-logic-in-controllers",
				severity: "error",
				count: 17,
			},
			{
				rule: "architecture/no-orm-in-controllers",
				severity: "error",
				count: 4,
			},
			{
				rule: "correctness/require-inject-decorator",
				severity: "error",
				count: 3,
			},
			{ rule: "schema/require-primary-key", severity: "error", count: 3 },
			{
				rule: "architecture/no-manual-instantiation",
				severity: "error",
				count: 2,
			},
			{
				rule: "architecture/no-circular-module-deps",
				severity: "error",
				count: 2,
			},
		],
		scannedAt: "2026-09-02",
		commit: "5ef2238883cad7c3980084de9a9031135fb9734f",
	},
];

export interface ResolvedLeaderboardEntry extends LeaderboardEntry {
	shareUrl: string;
}

export const LEADERBOARD_ENTRIES: ResolvedLeaderboardEntry[] = RAW_ENTRIES.sort(
	(entryA, entryB) => entryB.score - entryA.score
).map((entry) => ({ ...entry, shareUrl: buildShareUrl(entry) }));
