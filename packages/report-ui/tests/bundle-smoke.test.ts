import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const DIST_HTML = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"dist",
	"index.html"
);

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter((p): p is string => Boolean(p));

const findChrome = (): string | null =>
	CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;

const BOOTED_STATE_RE = /class="report-(root|error)"/;
const EXTERNAL_REF_RE = /(?:src|href)="https?:\/\//;

/**
 * Boots the exported single file in real headless Chrome. jsdom stalls
 * silently inside the Next bootstrap and cannot certify the file:// boot,
 * so this is the load-bearing self-containment proof.
 */
describe("bundle smoke", () => {
	const chrome = findChrome();

	it.skipIf(!(chrome && existsSync(DIST_HTML)))(
		"hydrates the single exported file over file://",
		() => {
			const dom = execFileSync(
				chrome as string,
				[
					"--headless=new",
					"--disable-gpu",
					"--no-sandbox",
					// Freeze after the virtual budget regardless of live timers.
					"--virtual-time-budget=8000",
					"--dump-dom",
					pathToFileURL(DIST_HTML).href,
				],
				{ encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }
			);

			// Only executed script leaves the prerendered .report-loading state.
			expect(dom).toMatch(BOOTED_STATE_RE);
			// Zero real network use: nothing may reference the internet.
			// Structural /_next leakage is guarded at build time by
			// inline-report.mjs exiting nonzero; the Next loader may still
			// synthesize inert <script>/<link> chunk probes at runtime whose
			// silent failure does not affect rendering.
			expect(dom).not.toMatch(EXTERNAL_REF_RE);
		}
	);
});
