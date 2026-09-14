import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encodeCodeGraph } from "../../src/common/code-graph-codec.js";
import { buildHtmlReport } from "../../src/report/html-report.js";
import {
	codeDiagnostic,
	DESCENT_GRAPH,
	EMPTY_ARTIFACT,
} from "./report-artifact-fixture.js";

// Path to a Chrome with the WebMCP feature, e.g.
// WEBMCP_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const CHROME = process.env.WEBMCP_CHROME;
const LISTENING_RE = /DevTools listening on (ws:\/\/\S+)/;
const EXPLAIN_HEAD = /^POST \/a → AController\.handle/;

// Runs inside the report once it has booted: asks the browser's own registry.
const PROBE = `<pre id="webmcp-probe">pending</pre>
<script>
window.addEventListener("load", () => setTimeout(async () => {
  const out = {};
  try {
    const mc = document.modelContext;
    const tools = await mc.getTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    out.names = tools.map((t) => t.name).sort();
    out.annotations = byName.list_findings.annotations;
    out.schema = JSON.parse(byName.explain_endpoint.inputSchema);
    const call = async (name, input) =>
      JSON.parse(await mc.executeTool(byName[name], JSON.stringify(input))).content[0].text;
    out.summary = await call("get_summary", {});
    out.route = await call("explain_endpoint", { method: "POST", path: "/a" });
    out.findings = await call("list_findings", { severity: "error" });
  } catch (e) {
    out.error = String(e);
  }
  document.getElementById("webmcp-probe").textContent = JSON.stringify(out);
}, 300));
</script>
</body>`;

interface CdpMessage {
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	result?: Record<string, unknown>;
	sessionId?: string;
}

/** Launches Chrome with a debugging port and returns its browser websocket URL. */
function launchChrome(
	chrome: string,
	profile: string
): Promise<{ proc: ChildProcess; wsUrl: string }> {
	const proc = spawn(
		chrome,
		[
			"--headless=new",
			"--no-sandbox",
			"--disable-gpu",
			"--no-first-run",
			`--user-data-dir=${profile}`,
			"--enable-features=WebMCP",
			"--remote-debugging-port=0",
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "pipe"] }
	);
	return new Promise((resolve, reject) => {
		let err = "";
		proc.stderr?.on("data", (chunk: Buffer) => {
			err += chunk.toString();
			const match = LISTENING_RE.exec(err);
			if (match?.[1]) {
				resolve({ proc, wsUrl: match[1] });
			}
		});
		proc.on("exit", (code) =>
			reject(new Error(`chrome exited ${code}: ${err}`))
		);
	});
}

/** One page's probe result, read through the DevTools protocol. */
async function readProbe(wsUrl: string, url: string): Promise<string> {
	const ws = new WebSocket(wsUrl);
	await new Promise<void>((resolve, reject) => {
		ws.onopen = () => resolve();
		ws.onerror = () => reject(new Error("websocket failed"));
	});
	let nextId = 1;
	const pending = new Map<number, (m: CdpMessage) => void>();
	ws.onmessage = (event) => {
		const message = JSON.parse(String(event.data)) as CdpMessage;
		if (message.id !== undefined) {
			pending.get(message.id)?.(message);
			pending.delete(message.id);
		}
	};
	const send = (
		method: string,
		params: Record<string, unknown>,
		sessionId?: string
	): Promise<CdpMessage> =>
		new Promise((resolve) => {
			const id = nextId++;
			pending.set(id, resolve);
			ws.send(JSON.stringify({ id, method, params, sessionId }));
		});
	try {
		const target = await send("Target.createTarget", { url });
		const attached = await send("Target.attachToTarget", {
			flatten: true,
			targetId: target.result?.targetId,
		});
		const sessionId = attached.result?.sessionId as string;
		await send("Runtime.enable", {}, sessionId);
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			const probe = await send(
				"Runtime.evaluate",
				{
					expression:
						'document.getElementById("webmcp-probe")?.textContent ?? ""',
					returnByValue: true,
				},
				sessionId
			);
			const text = String(
				(probe.result?.result as { value?: string } | undefined)?.value ?? ""
			);
			if (text !== "" && text !== "pending") {
				return text;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error("the probe never finished");
	} finally {
		ws.close();
	}
}

let running: ChildProcess | undefined;

describe.skipIf(!CHROME)("WebMCP in a real Chrome", () => {
	afterEach(() => {
		running?.kill("SIGKILL");
		running = undefined;
	});

	it("registers the four tools and answers through the browser's executeTool", {
		timeout: 90_000,
	}, async () => {
		const dir = mkdtempSync(join(tmpdir(), "nd-webmcp-"));
		const artifact = {
			...EMPTY_ARTIFACT,
			codeGraph: encodeCodeGraph(DESCENT_GRAPH),
			diagnostics: [
				codeDiagnostic({
					filePath: "/repo/src/a.ts",
					line: 4,
					message: "eval is here",
					rule: "security/no-eval",
					severity: "error",
				}),
			],
			root: "/repo",
		};
		const html = buildHtmlReport(artifact, { telemetry: false });
		const page = join(dir, "report.html");
		const bodyEnd = html.lastIndexOf("</body>");
		expect(bodyEnd).toBeGreaterThan(0);
		writeFileSync(
			page,
			html.slice(0, bodyEnd) + PROBE + html.slice(bodyEnd + 7)
		);

		const { proc, wsUrl } = await launchChrome(
			CHROME as string,
			join(dir, "profile")
		);
		running = proc;
		const probe = JSON.parse(
			await readProbe(wsUrl, `file://${page}`)
		) as Record<string, unknown>;

		expect(probe.error).toBeUndefined();
		expect(probe.names).toEqual([
			"explain_boot_trace",
			"explain_endpoint",
			"get_summary",
			"list_findings",
		]);
		expect(probe.annotations).toEqual({
			readOnlyHint: true,
			untrustedContentHint: true,
		});
		expect(probe.schema).toEqual({
			properties: { method: { type: "string" }, path: { type: "string" } },
			required: ["path"],
			type: "object",
		});
		expect(probe.summary).toContain("score 100/100");
		expect(probe.route).toMatch(EXPLAIN_HEAD);
		expect(probe.findings).toBe(
			"error  security/no-eval  src/a.ts:4  eval is here"
		);
	});
});
