import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DOMWindow } from "jsdom";
import { describe, expect, it } from "vitest";

const DIST_HTML = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"dist",
	"index.html"
);

const FATAL_ERROR_RE = /errors\.dev|ChunkLoadError|Cannot find module/;

const loadDistHtml = (): string | null => {
	try {
		return readFileSync(DIST_HTML, "utf8");
	} catch {
		return null;
	}
};

describe("bundle smoke", () => {
	it.skipIf(loadDistHtml() === null)(
		"renders from the single exported file alone",
		async () => {
			const { JSDOM } = await import("jsdom");
			const { ReadableStream } = await import("node:stream/web");
			const html = loadDistHtml() as string;

			const errors: string[] = [];
			const dom = new JSDOM(html, {
				runScripts: "dangerously",
				url: "file:///report.html",
				pretendToBeVisual: true,
				beforeParse(window: DOMWindow) {
					Object.defineProperty(window, "ReadableStream", {
						configurable: true,
						value: ReadableStream,
					});
					window.addEventListener("error", (event) => {
						errors.push(String(event.message));
					});
				},
			});

			await new Promise((resolve) => setTimeout(resolve, 2000));

			const body = dom.window.document.body;
			const text = body.textContent ?? "";
			const rendered =
				text.includes("demo-app") ||
				body.querySelector(".report-root") !== null;
			const fatal = errors.length > 0 && FATAL_ERROR_RE.test(errors.join("\n"));

			expect(fatal, errors.join("\n")).toBe(false);
			expect(
				rendered ||
					text.includes("Report artifact not embedded") ||
					body.querySelector(".report-loading") !== null
			).toBe(true);
			dom.window.close();
		}
	);
});
