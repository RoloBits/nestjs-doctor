import type { HoverCardData } from "../molecules/hover-card.js";
import {
	type BootSpan,
	type BootTimeline,
	spanColor,
	UNATTRIBUTED_MODULE,
} from "./boot-timeline.js";
import { formatMs, hookMeta } from "./trace.js";

function share(ms: number, maxMs: number): string {
	return `${((ms / maxMs) * 100).toFixed(1)}% of boot`;
}

function contextOf(span: BootSpan): string {
	if (span.module === UNATTRIBUTED_MODULE) {
		return `module not identified · ${span.type}`;
	}
	if (span.external && span.via) {
		return `in ${span.module} · imported by ${span.via} · ${span.type}`;
	}
	return `in ${span.module} · ${span.type}`;
}

/** What the hover card says for a class bar, or for one of its hook spans. */
export function hoverCardData(
	t: BootTimeline,
	span: BootSpan,
	hookIndex: number | null
): HoverCardData {
	const context = contextOf(span);
	const from = { color: `rgb(${spanColor(span.type)})`, label: span.name };
	const hook = hookIndex === null ? undefined : span.hooks?.[hookIndex];
	if (hook) {
		const meta = hookMeta(hook.hook);
		const at =
			typeof hook.startMs === "number" ? ` · at ${formatMs(hook.startMs)}` : "";
		return {
			context,
			detail: {
				dim: `(${share(hook.ms, t.maxMs)})${at}`,
				main: formatMs(hook.ms),
			},
			from,
			title: hook.hook,
			to: { color: `rgb(${meta.rgb})`, label: meta.label },
		};
	}
	const own = span.end - span.start;
	const dep = span.waitedOn ? t.byId.get(span.waitedOn) : undefined;
	return {
		context,
		detail: {
			dim: `(${share(own, t.maxMs)}) · finished at ${formatMs(span.end)}`,
			main: formatMs(own),
		},
		from,
		title: dep ? `construction, after ${dep.name}` : "construction",
		...(dep
			? { to: { color: `rgb(${spanColor(dep.type)})`, label: dep.name } }
			: {}),
	};
}
