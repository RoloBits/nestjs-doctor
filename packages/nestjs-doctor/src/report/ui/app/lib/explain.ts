import type { CodeGraph } from "../../../../common/code-graph.js";
import {
	buildEndpoints,
	type DescentEndpoint,
	defaultPreset,
	keptSteps,
	PRESETS,
	presetState,
	relativeTo,
	stepCategory,
	stepFlags,
} from "./descent-walk.js";

export interface ExplainContext {
	/** Scan root, posix, so paths print relative. */
	root?: string;
	/** Source text keyed by absolute path, for the code frames. */
	sources?: Record<string, string>;
	version: string;
}

const DOCS_URL = "https://nestjs.doctor/docs/report#endpoints";
/** Step lines the text carries before it says how many more there are. */
const MAX_STEP_LINES = 30;
/** Condition lines the text carries; the ones above the verdict's steps come first. */
const MAX_CONDITION_LINES = 12;
const FRAME_RADIUS = 1;

/** The category token a step line shows: `db read`, `throw`, `call`. */
function categoryToken(endpoint: DescentEndpoint, node: number): string {
	const target = endpoint.nodes[node];
	if (!target) {
		return "";
	}
	return target.dbOp === null ? stepCategory(target) : `db ${target.dbOp}`;
}

/** `file:line` of the call site that reached a step, or the entry's own line. */
function stepSite(
	endpoint: DescentEndpoint,
	step: number,
	root: string | undefined
): string {
	const walkStep = endpoint.walk[step];
	if (!walkStep) {
		return "";
	}
	const edge = endpoint.edges[walkStep.edge];
	const node = edge ? endpoint.nodes[edge.from] : endpoint.nodes[walkStep.node];
	if (!node) {
		return "";
	}
	const line = edge ? edge.line : node.line;
	return `${relativeTo(root, node.filePath)}:${line}`;
}

function stepLine(
	endpoint: DescentEndpoint,
	step: number,
	root: string | undefined
): string {
	const walkStep = endpoint.walk[step];
	const node = walkStep ? endpoint.nodes[walkStep.node] : undefined;
	if (!(walkStep && node)) {
		return "";
	}
	const flags = stepFlags(endpoint, walkStep).join(" ");
	const marks = [categoryToken(endpoint, walkStep.node), flags]
		.filter(Boolean)
		.join("  ");
	return ` ${`@${step}`.padEnd(5)} ${node.label.padEnd(36)} ${marks.padEnd(22)} ${stepSite(endpoint, step, root)}`;
}

/** Kept step lines in walk order, hidden runs folded into one line each. */
function stepLines(
	endpoint: DescentEndpoint,
	kept: number[],
	root: string | undefined
): string[] {
	const keptSet = new Set(kept);
	const lines: string[] = [];
	let hidden = 0;
	let shown = 0;
	const flush = () => {
		if (hidden > 0) {
			lines.push(` … ${hidden} hidden`);
			hidden = 0;
		}
	};
	for (let step = 0; step < endpoint.walk.length; step++) {
		if (!keptSet.has(step)) {
			hidden++;
			continue;
		}
		if (shown === MAX_STEP_LINES) {
			flush();
			lines.push(` … and ${kept.length - shown} more steps`);
			return lines;
		}
		flush();
		lines.push(stepLine(endpoint, step, root));
		shown++;
	}
	flush();
	return lines;
}

/**
 * One line per condition or guard on a kept step or any caller above it. The
 * chains above the first read and the first write come first, so a cap keeps
 * the conditions that decide the verdict.
 */
function conditionLines(endpoint: DescentEndpoint, kept: number[]): string[] {
	const lines: string[] = [];
	const seen = new Set<number>();
	const { firstRead, firstWrite } = endpoint.verdict;
	const starts = [firstRead, firstWrite]
		.filter((step) => step !== -1)
		.concat(kept);
	for (const start of starts) {
		for (
			let step = start;
			step !== -1;
			step = endpoint.walk[step]?.parent ?? -1
		) {
			if (seen.has(step)) {
				break;
			}
			seen.add(step);
			const walkStep = endpoint.walk[step];
			const edge = walkStep ? endpoint.edges[walkStep.edge] : undefined;
			const node = walkStep ? endpoint.nodes[walkStep.node] : undefined;
			if (!(edge && node)) {
				continue;
			}
			if (edge.conditional) {
				lines.push(
					` @${step}  ${node.label} runs only when ${edge.conditionText ?? "a condition holds"}`
				);
			}
			if (edge.guardThrows) {
				lines.push(
					` @${step}  ${node.label} throws ${edge.guardThrows} when it comes back empty`
				);
			}
		}
	}
	if (lines.length <= MAX_CONDITION_LINES) {
		return lines.sort((a, b) => stepOf(a) - stepOf(b));
	}
	const shown = lines
		.slice(0, MAX_CONDITION_LINES)
		.sort((a, b) => stepOf(a) - stepOf(b));
	shown.push(` … and ${lines.length - MAX_CONDITION_LINES} more`);
	return shown;
}

function stepOf(line: string): number {
	return Number(line.slice(2, line.indexOf(" ", 2)));
}

/** The call-site lines of the first read and the first write, with a marker. */
function frameLines(endpoint: DescentEndpoint, ctx: ExplainContext): string[] {
	if (!ctx.sources) {
		return [];
	}
	const lines: string[] = [];
	const seen = new Set<string>();
	for (const step of [
		endpoint.verdict.firstRead,
		endpoint.verdict.firstWrite,
	]) {
		const walkStep = endpoint.walk[step];
		const edge = walkStep ? endpoint.edges[walkStep.edge] : undefined;
		const caller = edge ? endpoint.nodes[edge.from] : undefined;
		if (!(edge && caller)) {
			continue;
		}
		const source = ctx.sources[caller.filePath];
		const key = `${caller.filePath}:${edge.line}`;
		if (!source || seen.has(key)) {
			continue;
		}
		seen.add(key);
		const all = source.split("\n");
		lines.push(` ${relativeTo(ctx.root, caller.filePath)}`);
		for (
			let n = Math.max(1, edge.line - FRAME_RADIUS);
			n <= Math.min(all.length, edge.line + FRAME_RADIUS);
			n++
		) {
			lines.push(
				`${n === edge.line ? ">" : " "} ${String(n).padStart(4)}  ${all[n - 1]}`
			);
		}
	}
	return lines;
}

function verdictSentence(endpoint: DescentEndpoint): string {
	const { firstRead, firstWrite, other, reads, writes } = endpoint.verdict;
	if (reads + writes + other === 0) {
		return "the walk reached no node the scan classified as db; a driver it did not classify is invisible here";
	}
	const parts: string[] = [];
	if (firstRead !== -1) {
		parts.push(`first database read at step ${firstRead}`);
	}
	if (firstWrite !== -1) {
		parts.push(`first write at step ${firstWrite}`);
	}
	if (parts.length === 0) {
		parts.push("every db call fell outside the read and write verbs");
	}
	return `${parts.join(", ")}; direction comes from the ORM method name, and TypeORM create and merge do not count`;
}

/** The route as plain text an agent can read: verdict, steps, conditions, frames. */
export function explainEndpoint(
	endpoint: DescentEndpoint,
	ctx: ExplainContext
): string {
	const entry = endpoint.nodes[endpoint.walk[0]?.node ?? 0];
	const preset = defaultPreset(endpoint);
	const kept = keptSteps(endpoint, presetState(preset));
	const { other, reads, writes } = endpoint.verdict;
	const counts = [
		`${reads} read`,
		`${writes} write`,
		other > 0 ? `${other} other` : "",
	]
		.filter(Boolean)
		.join(" · ");
	const presetLabel = PRESETS[preset]?.label ?? "all";
	const lines = [
		`${endpoint.httpMethod} ${endpoint.routePath} → ${endpoint.controllerClass}.${endpoint.handlerMethod}${
			entry ? `  (${relativeTo(ctx.root, entry.filePath)}:${entry.line})` : ""
		}`,
		`verdict: ${endpoint.verdict.text}  (${counts})`,
		`  ${verdictSentence(endpoint)}`,
		"",
		`steps (${presetLabel} preset, ${kept.length} of ${endpoint.walk.length}${
			endpoint.truncated ? ", walk truncated" : ""
		}):`,
		...stepLines(endpoint, kept, ctx.root),
	];
	const conditions = conditionLines(endpoint, kept);
	if (conditions.length > 0) {
		lines.push("conditions:", ...conditions);
	}
	const frames = frameLines(endpoint, ctx);
	if (frames.length > 0) {
		lines.push("code:", ...frames);
	}
	lines.push(
		"",
		`nestjs-doctor ${ctx.version} · ${DOCS_URL}`,
		"Source order of call sites walked depth-first, not a runtime trace. Read the docs before editing."
	);
	return `${lines.join("\n")}\n`;
}

/** The text of every route in a code graph, keyed by `Controller.handler:/path`. */
export function explainEndpoints(
	graph: CodeGraph,
	ctx: ExplainContext
): Map<string, string> {
	const out = new Map<string, string>();
	for (const endpoint of buildEndpoints(graph)) {
		out.set(endpoint.key, explainEndpoint(endpoint, ctx));
	}
	return out;
}
