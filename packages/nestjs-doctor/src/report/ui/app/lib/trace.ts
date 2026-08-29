import { escapeHtml } from "./escape.js";

interface TraceHook {
	count?: number;
	hook: string;
	ms: number;
}

/** The report's category colours as `r,g,b` triples, for rgb()/rgba(). */
export const PALETTE = {
	amber: "245,158,11",
	blue: "59,130,246",
	green: "16,185,129",
	grey: "136,136,136",
	violet: "139,92,246",
};

/** Darker shade of each palette colour, used to fill bars that carry text. */
const FILLS: Record<string, string> = {
	[PALETTE.amber]: "180,83,9",
	[PALETTE.blue]: "29,78,216",
	[PALETTE.green]: "4,120,87",
	[PALETTE.grey]: "75,85,99",
	[PALETTE.violet]: "109,40,217",
};

export function fillOf(rgb: string): string {
	return Object.hasOwn(FILLS, rgb) ? FILLS[rgb] : rgb;
}

const HOOK_META: Record<string, { label: string; rgb: string }> = {
	onApplicationBootstrap: { label: "bootstrap", rgb: PALETTE.violet },
	onModuleInit: { label: "init", rgb: PALETTE.green },
};

/** Short label and colour for a lifecycle hook; unknown hooks stay grey. */
export function hookMeta(hook: string): { label: string; rgb: string } {
	return Object.hasOwn(HOOK_META, hook)
		? HOOK_META[hook]
		: { label: hook, rgb: PALETTE.grey };
}

interface PhasePart {
	gloss: string;
	label: string;
	ms: number;
	rgb: string;
	tip: string;
}

interface PhasedGraph {
	phases?: {
		createMs?: number;
		initMs?: number;
		moduleInitMs?: number;
	} | null;
	startupMs?: number;
}

// Splits the captured boot into labelled segments. Without createMs the
// earlier boundaries are unknown, so segments would mislabel.
export function phaseParts(graph: PhasedGraph): PhasePart[] {
	const p = graph.phases;
	if (!p || typeof p.createMs !== "number") {
		return [];
	}
	const parts: PhasePart[] = [];
	let prev = 0;
	const push = (
		label: string,
		gloss: string,
		end: number | undefined,
		rgb: string,
		tip: string
	) => {
		if (typeof end !== "number" || end <= prev) {
			return;
		}
		parts.push({ gloss, label, ms: end - prev, rgb, tip });
		prev = end;
	};
	push(
		"create",
		"building modules",
		p.createMs,
		PALETTE.blue,
		"create — NestFactory constructs every module, provider, and controller."
	);
	if (typeof p.moduleInitMs === "number") {
		push(
			"onModuleInit",
			"init hooks",
			p.moduleInitMs,
			PALETTE.green,
			"onModuleInit — after construction, Nest calls each class's onModuleInit() hook"
		);
		push(
			"onApplicationBootstrap",
			"bootstrap hooks",
			p.initMs,
			PALETTE.violet,
			"onApplicationBootstrap — hooks that run once the whole app is wired, right before it listens"
		);
	} else {
		push(
			"lifecycle hooks",
			"lifecycle hooks",
			p.initMs,
			PALETTE.green,
			"lifecycle hooks — onModuleInit and onApplicationBootstrap"
		);
	}
	if (typeof graph.startupMs === "number") {
		let tail = {
			label: "hooks + listen",
			gloss: "hooks + port",
			tip: "hooks + listen — everything after NestFactory.create",
		};
		if (typeof p.initMs === "number") {
			tail = {
				label: "listen",
				gloss: "opening the port",
				tip: "listen — the HTTP server binds its port; at the end of this segment the app is up",
			};
		} else if (typeof p.moduleInitMs === "number") {
			tail = {
				label: "bootstrap + listen",
				gloss: "bootstrap + port",
				tip: "bootstrap + listen — onApplicationBootstrap hooks and the server bind",
			};
		}
		push(tail.label, tail.gloss, graph.startupMs, PALETTE.grey, tail.tip);
	}
	return parts;
}

export function formatMs(ms: number): string {
	const r = Math.round(ms * 10) / 10;
	if (r < 1) {
		return "<1ms";
	}
	if (r < 10) {
		return `${r.toFixed(1)}ms`;
	}
	return `${Math.round(ms)}ms`;
}

export function hookChipHtml(hooks: TraceHook[] | undefined): string {
	if (!hooks || hooks.length === 0) {
		return "";
	}
	let html = "";
	for (const h of hooks) {
		const meta = hookMeta(h.hook);
		const times = h.count && h.count > 1 ? ` across ${h.count} instances` : "";
		html +=
			`<span class="mg-trace-hook" style="color:rgb(${meta.rgb});background:rgba(${meta.rgb},0.12)"` +
			` data-tip="${escapeHtml(`${h.hook} took ${formatMs(h.ms)}${times}`)}">+` +
			`${escapeHtml(formatMs(h.ms))} ${escapeHtml(meta.label)}` +
			`${h.count && h.count > 1 ? ` ×${h.count}` : ""}</span>`;
	}
	return html;
}

// Round tick spacing so axis cuts land on 1/2/5-style values.
export function axisStep(maxMs: number): number {
	const raw = maxMs / 4;
	const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.001)));
	for (const m of [5, 2, 1]) {
		if (m * pow <= raw) {
			return m * pow;
		}
	}
	return pow;
}
