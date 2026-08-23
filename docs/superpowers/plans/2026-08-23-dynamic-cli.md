# Dynamic CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the append-only post-scan prompts with a responsive Ink UI that opens on Score and actions and shows a live Wide review with nestjs-doctor's recommendations and Bad/Good examples.

**Architecture:** Keep scanning, output formats, score calculation, diagnostic scoping, and gates unchanged. After the existing interactive score summary is printed, dynamically mount one Ink application in the alternate screen; its immutable input is the finished `DiagnoseResult`, and its pure findings model drives landing, review, Compact detail, and handoff screens. If Ink fails, restore the terminal and run the existing Clack menu.

**Tech Stack:** TypeScript, React 19, Ink 7, ink-testing-library 4, Vitest 3, tsdown, Clack fallback.

**Spec:** `docs/superpowers/specs/2026-08-23-dynamic-cli-design.md`

## Global Constraints

- Change only interactive `console` runs; JSON, SARIF, GitLab, Markdown, GitHub annotations, `--score`, pipes, CI, and coding-agent runs remain unchanged.
- The score always represents the whole project; the viewer uses `withSurface(result, "cli")` and the already resolved reporting scope.
- Wide applies at `columns >= 120 && rows >= 22`; Stacked applies when Wide is false, `rows > 23`, and `columns >= 60`; every other size is Compact.
- `Esc` returns to Score and actions without rescanning; `q` preserves the existing gate-controlled exit code.
- Code and schema diagnostics remain distinct; never assume a diagnostic has `line` or `column`.
- The UI must remain readable with `NO_COLOR` and on Windows terminals without the Unicode glyph set.
- No post-scan action may write `process.exitCode`; only `--min-score` and `--blocking` own exit code `1`, while bad input exits `2` before the TUI opens.
- React and Ink must stay behind the existing interactive gate and a dynamic import.
- Add a patch changeset for the published `nestjs-doctor` package.

## File structure

### Pure interactive model

- `packages/nestjs-doctor/src/cli/interactive/findings-model.ts` — rule grouping, two sort orders, diagnostic locations, docs URLs, and fix prompts.
- `packages/nestjs-doctor/src/cli/interactive/rule-info.ts` — exported `RuleInfo` consumed by both legacy and Ink renderers.
- `packages/nestjs-doctor/src/cli/interactive/code-frame.ts` — shared unstyled code-frame rows plus the existing ANSI renderer.

### Ink application

- `packages/nestjs-doctor/src/cli/interactive/tui/types.ts` — shared props, feedback, actions, and exit requests.
- `packages/nestjs-doctor/src/cli/interactive/tui/layout.ts` — terminal breakpoint and viewport calculations.
- `packages/nestjs-doctor/src/cli/interactive/tui/theme.ts` — brand colors, severity variants, and Unicode/ASCII symbols.
- `packages/nestjs-doctor/src/cli/interactive/tui/use-scroll-viewport.ts` — selectable list/detail viewport state.
- `packages/nestjs-doctor/src/cli/interactive/tui/detail-lines.ts` — width-bounded detail rows, wrapping, examples, and occurrence-specific content.
- `packages/nestjs-doctor/src/cli/interactive/tui/score-header.tsx` — score and scoped count header.
- `packages/nestjs-doctor/src/cli/interactive/tui/action-menu.tsx` — reusable keyboard action list.
- `packages/nestjs-doctor/src/cli/interactive/tui/landing.tsx` — Score and actions screen.
- `packages/nestjs-doctor/src/cli/interactive/tui/findings-viewer.tsx` — Wide, Stacked, Compact list/detail renderer and controls.
- `packages/nestjs-doctor/src/cli/interactive/tui/handoff-screen.tsx` — agent/copy choices without Clack output.
- `packages/nestjs-doctor/src/cli/interactive/tui/app.tsx` — screen state and async feedback.
- `packages/nestjs-doctor/src/cli/interactive/tui/run.tsx` — alternate-screen mount, terminal cleanup, external action loop, and fallback boundary.

### Existing integration points

- `packages/nestjs-doctor/src/cli/interactive/menu.ts` — retain the legacy Clack menu as `runLegacyInteractiveMenu`; make `runInteractiveMenu` dynamically invoke Ink and fall back here.
- `packages/nestjs-doctor/src/cli/interactive/handoff.ts` — export agent detection/launch primitives while retaining the legacy picker.
- `packages/nestjs-doctor/src/cli/index.ts` and both pipelines remain structurally unchanged.

---

### Task 1: Extract the pure findings model

**Files:**
- Create: `packages/nestjs-doctor/src/cli/interactive/findings-model.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/detail.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/handoff.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/rule-info.ts`
- Modify: `packages/nestjs-doctor/tests/unit/interactive-detail.test.ts`
- Test: `packages/nestjs-doctor/tests/unit/interactive-handoff.test.ts`

**Interfaces:**
- Produces: `FindingGroup`, `FindingSort`, `groupFindings(diagnostics, sort?)`, `formatDiagnosticLocation(diagnostic)`, `docsUrl(rule)`, and `buildFixPrompt(group, targetPath)`.
- Preserves: `groupFindings(diagnostics)` defaults to priority order so the handoff stays worst-first.
- Adds: `groupFindings(diagnostics, "category")` for the viewer's category-first order.

- [ ] **Step 1: Move the model expectations to the new module and add category ordering**

```ts
import {
	buildFixPrompt,
	groupFindings,
} from "../../src/cli/interactive/findings-model.js";

it("groups the viewer by category, then severity and count", () => {
	const groups = groupFindings(
		[
			code({ category: "correctness", rule: "correctness/a", severity: "error" }),
			code({ category: "security", rule: "security/z", severity: "warning" }),
			code({ category: "security", rule: "security/b", severity: "error" }),
			code({ category: "schema", rule: "schema/c", severity: "warning" }),
		],
		"category"
	);
	expect(groups.map((group) => group.rule)).toEqual([
		"security/b",
		"security/z",
		"correctness/a",
		"schema/c",
	]);
});
```

- [ ] **Step 2: Run the focused tests and verify the new import fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-detail.test.ts tests/unit/interactive-handoff.test.ts`

Expected: FAIL because `interactive/findings-model.js` does not exist.

- [ ] **Step 3: Implement the pure model with both sort orders**

```ts
export type FindingSort = "category" | "priority";

export interface FindingGroup {
	category: Category;
	diagnostics: Diagnostic[];
	docsUrl?: string;
	info: RuleInfo;
	rule: string;
	severity: Severity;
}

export const groupFindings = (
	diagnostics: Diagnostic[],
	sort: FindingSort = "priority"
): FindingGroup[] => {
	const groups = new Map<string, FindingGroup>();
	for (const diagnostic of diagnostics) {
		const existing = groups.get(diagnostic.rule);
		if (existing) {
			existing.diagnostics.push(diagnostic);
			if (SEVERITY_RANK[diagnostic.severity] < SEVERITY_RANK[existing.severity]) {
				existing.severity = diagnostic.severity;
			}
			continue;
		}
		groups.set(diagnostic.rule, {
			category: diagnostic.category,
			diagnostics: [diagnostic],
			docsUrl: docsUrl(diagnostic.rule),
			info: ruleInfo(diagnostic.rule),
			rule: diagnostic.rule,
			severity: diagnostic.severity,
		});
	}
	return [...groups.values()].sort(sort === "category" ? compareCategory : comparePriority);
};
```

Define the comparison functions before `groupFindings`:

```ts
const CATEGORY_RANK: Record<Category, number> = {
	security: 0,
	correctness: 1,
	schema: 2,
	architecture: 3,
	performance: 4,
};

const SEVERITY_RANK: Record<Severity, number> = {
	error: 0,
	warning: 1,
	info: 2,
};

const comparePriority = (a: FindingGroup, b: FindingGroup): number =>
	SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
	b.diagnostics.length - a.diagnostics.length ||
	a.rule.localeCompare(b.rule);

const compareCategory = (a: FindingGroup, b: FindingGroup): number =>
	CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
	comparePriority(a, b);
```

- [ ] **Step 4: Export `RuleInfo` and move prompt/location/docs functions without changing their text**

```ts
export interface RuleInfo {
	bad?: string;
	description?: string;
	good?: string;
}

export const formatDiagnosticLocation = (diagnostic: Diagnostic): string =>
	isCodeDiagnostic(diagnostic)
		? `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column}`
		: `entity ${diagnostic.entity}`;
```

Move the current `docsUrl` and `buildFixPrompt` bodies exactly, replacing their private `locate` calls with `formatDiagnosticLocation`. Update `detail.ts` and `handoff.ts` imports; keep their public behavior unchanged.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-detail.test.ts tests/unit/interactive-handoff.test.ts tests/unit/interactive-rule-panel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the model extraction**

```bash
git add packages/nestjs-doctor/src/cli/interactive packages/nestjs-doctor/tests/unit/interactive-detail.test.ts packages/nestjs-doctor/tests/unit/interactive-handoff.test.ts
git commit -m "refactor(cli): extract the findings model"
```

### Task 2: Add the Ink foundation and responsive layout

**Files:**
- Modify: `packages/nestjs-doctor/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/nestjs-doctor/tsconfig.json`
- Modify: `packages/nestjs-doctor/vitest.config.ts`
- Modify: `knip.config.ts`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/layout.ts`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/theme.ts`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-layout.test.ts`

**Interfaces:**
- Produces: `ReportLayout`, `resolveReportLayout(columns, rows, entryCount)`.
- Produces: `severityVariant(severity, unicode)` and `TUI_THEME`.

- [ ] **Step 1: Write the breakpoint and tiny-terminal tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveReportLayout } from "../../src/cli/interactive/tui/layout.js";
import { terminalSymbols } from "../../src/cli/interactive/tui/theme.js";

describe("resolveReportLayout", () => {
	it("uses the approved Wide breakpoint and 38/62 split", () => {
		const layout = resolveReportLayout(140, 32, 12);
		expect(layout.mode).toBe("wide");
		expect(layout.listWidth + layout.detailWidth + 1).toBe(layout.width);
		expect(layout.detailWidth).toBeGreaterThan(layout.listWidth);
	});

	it("uses Stacked only when Wide is false and enough rows exist", () => {
		expect(resolveReportLayout(100, 30, 12).mode).toBe("stacked");
		expect(resolveReportLayout(140, 21, 12).mode).toBe("compact");
	});

	it("uses Compact for short or very narrow terminals", () => {
		expect(resolveReportLayout(100, 23, 12).mode).toBe("compact");
		expect(resolveReportLayout(59, 40, 12).mode).toBe("compact");
	});

	it("never returns negative viewport dimensions", () => {
		const layout = resolveReportLayout(20, 5, 0);
		expect(layout.listHeight).toBeGreaterThanOrEqual(1);
		expect(layout.detailHeight).toBeGreaterThanOrEqual(1);
	});
});

it("keeps severity and examples readable without Unicode", () => {
	expect(terminalSymbols(false)).toMatchObject({
		bad: "[x]",
		error: "x",
		good: "[v]",
		info: "i",
		warning: "!",
	});
});
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-layout.test.ts`

Expected: FAIL because `tui/layout.js` does not exist.

- [ ] **Step 3: Add the runtime and test dependencies**

Run:

```bash
pnpm --filter nestjs-doctor add ink@^7.1.0 react@^19.2.5
pnpm --filter nestjs-doctor add -D @types/react@^19.2.2 ink-testing-library@^4.0.0
```

Expected: `packages/nestjs-doctor/package.json` and `pnpm-lock.yaml` record the four packages; Ink and React are runtime dependencies.

- [ ] **Step 4: Enable TSX in typechecking, tests, and Knip**

Set `"jsx": "react-jsx"` in the package `compilerOptions`. Change Vitest's include to `include: ["tests/**/*.test.{ts,tsx}"]`. Change Knip's nestjs-doctor project to `project: ["src/**/*.{ts,tsx}"]`.

- [ ] **Step 5: Implement the exact layout result**

```ts
export type ReportLayoutMode = "compact" | "stacked" | "wide";

export interface ReportLayout {
	detailHeight: number;
	detailWidth: number;
	listHeight: number;
	listWidth: number;
	mode: ReportLayoutMode;
	width: number;
}

export const resolveReportLayout = (
	columns: number,
	rows: number,
	entryCount: number
): ReportLayout => {
	const width = Math.max(20, columns - 2);
	const wide = columns >= 120 && rows >= 22;
	const mode: ReportLayoutMode = wide
		? "wide"
		: rows > 23 && columns >= 60
			? "stacked"
			: "compact";
	const detailWidth = wide ? Math.max(20, Math.floor((width - 1) * 0.62)) : width;
	const listWidth = wide ? width - detailWidth - 1 : width;
	const usableRows = Math.max(3, rows - 8);
	const detailHeight = mode === "wide" ? usableRows : Math.max(1, Math.floor(usableRows * 0.55));
	const listHeight = mode === "wide"
		? usableRows
		: Math.max(1, Math.min(entryCount, usableRows - detailHeight));
	return { detailHeight, detailWidth, listHeight, listWidth, mode, width };
};
```

- [ ] **Step 6: Add exact theme and symbol contracts**

```ts
export const TUI_THEME = {
	brand: "#ea2845",
	border: "#4c4c4c",
	dim: "#888888",
	error: "#ef4444",
	good: "#4ade80",
	info: "#3b82f6",
	text: "#e8e8e8",
	warning: "#f59e0b",
} as const;

export const terminalSymbols = (unicode: boolean) => ({
	active: unicode ? "▎" : ">",
	bad: unicode ? "✗" : "[x]",
	error: unicode ? "✖" : "x",
	good: unicode ? "✓" : "[v]",
	info: unicode ? "●" : "i",
	warning: unicode ? "⚠" : "!",
});

export const severityVariant = (severity: Severity, unicode: boolean) => ({
	color: TUI_THEME[severity],
	icon: terminalSymbols(unicode)[severity],
	label: severity,
});
```

Use the existing Windows Terminal check: Unicode is available when the platform is not `win32` or `WT_SESSION` is present.

- [ ] **Step 7: Run foundation checks**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-layout.test.ts && pnpm --filter nestjs-doctor typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the TUI foundation**

```bash
git add packages/nestjs-doctor/package.json packages/nestjs-doctor/tsconfig.json packages/nestjs-doctor/vitest.config.ts packages/nestjs-doctor/src/cli/interactive/tui packages/nestjs-doctor/tests/unit/interactive-tui-layout.test.ts knip.config.ts pnpm-lock.yaml
git commit -m "feat(cli): add the interactive TUI foundation"
```

### Task 3: Build Score and actions

**Files:**
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/score-header.tsx`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/action-menu.tsx`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/landing.tsx`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/types.ts`
- Create: `packages/nestjs-doctor/tests/helpers/result.ts`
- Modify: `packages/nestjs-doctor/tests/unit/console-reporter.test.ts`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-landing.test.tsx`

**Interfaces:**
- Consumes: `DiagnoseResult`, `TUI_THEME`, and `terminalSymbols` from Tasks 1–2.
- Produces: `Landing`, which calls `onReview`, `onOpenReport`, `onAddCi`, `onHandoff`, `onCopyMarkdown`, or `onQuit` and accepts optional `TuiFeedback`.
- Produces: `ActionMenu`, a controlled list with arrows/j/k, Enter, Esc, and q.
- Produces shared `InteractiveContext` and `TuiFeedback`; Task 6 adds handler and exit-request types once its action boundary exists.

- [ ] **Step 1: Write the landing interaction test**

First move the existing `makeResult` fixture from `console-reporter.test.ts` into this shared helper and add the missing schema count:

```ts
import type { CodeDiagnostic } from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";

export const makeCodeDiagnostic = (
	overrides: Partial<CodeDiagnostic> = {}
): CodeDiagnostic => ({
	category: "security",
	column: 3,
	filePath: "/app/src/auth.service.ts",
	help: "Move the secret to ConfigService.",
	line: 18,
	message: "A credential-like value is stored in source.",
	rule: "security/no-hardcoded-secrets",
	severity: "error",
	...overrides,
});

export const makeResult = (
	overrides: Partial<DiagnoseResult> = {}
): DiagnoseResult => ({
	diagnostics: [],
	elapsedMs: 1200,
	project: {
		fileCount: 20,
		framework: "express",
		moduleCount: 5,
		name: "test-project",
		nestVersion: "10.0.0",
		orm: "prisma",
	},
	ruleErrors: [],
	score: { label: "Good", value: 85 },
	summary: {
		byCategory: {
			architecture: 0,
			correctness: 0,
			performance: 0,
			schema: 0,
			security: 0,
		},
		errors: 0,
		info: 0,
		total: 0,
		warnings: 0,
	},
	...overrides,
});
```

Update `console-reporter.test.ts` to import this helper, then add the TUI test:

```tsx
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { Landing } from "../../src/cli/interactive/tui/landing.js";
import { makeCodeDiagnostic, makeResult } from "../helpers/result.js";

it("shows score and actions, then selects Review", () => {
	const onReview = vi.fn();
	const view = render(
		<Landing
			canAddCi={true}
			feedback={null}
			onAddCi={vi.fn()}
			onCopyMarkdown={vi.fn()}
			onHandoff={vi.fn()}
			onOpenReport={vi.fn()}
			onQuit={vi.fn()}
			onReview={onReview}
			result={makeResult({
				diagnostics: [makeCodeDiagnostic()],
				score: { label: "Needs attention", value: 72 },
				summary: {
					byCategory: {
						architecture: 0,
						correctness: 0,
						performance: 0,
						schema: 0,
						security: 1,
					},
					errors: 1,
					info: 0,
					total: 1,
					warnings: 0,
				},
			})}
		/>
	);
	expect(view.lastFrame()).toContain("72 / 100");
	expect(view.lastFrame()).toContain("Review");
	view.stdin.write("\r");
	expect(onReview).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the landing test and verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-landing.test.tsx`

Expected: FAIL because `Landing` does not exist.

- [ ] **Step 3: Implement the controlled action menu**

Create the shared context before the components consume it:

```ts
export interface InteractiveContext {
	buildReportHtml: () => string;
	result: DiagnoseResult;
	targetPath: string;
	version: string;
}

export interface TuiFeedback {
	message: string;
	tone: "error" | "success" | "warning";
}
```

```tsx
export interface ActionItem {
	description?: string;
	id: string;
	label: string;
	onSelect: () => void;
}

export const ActionMenu = ({
	actions,
	onQuit,
	unicode,
}: {
	actions: ActionItem[];
	onQuit: () => void;
	unicode: boolean;
}) => {
	const [selected, setSelected] = useState(0);
	const symbols = terminalSymbols(unicode);
	useInput((input, key) => {
		if (input === "q") return onQuit();
		if (key.upArrow || input === "k") return setSelected((value) => Math.max(0, value - 1));
		if (key.downArrow || input === "j") return setSelected((value) => Math.min(actions.length - 1, value + 1));
		if (key.return) actions[selected]?.onSelect();
	});
	return <Box flexDirection="column">{actions.map((action, index) => (
		<Text key={action.id} color={index === selected ? TUI_THEME.brand : undefined} bold={index === selected}>
			{index === selected ? `${symbols.active} ` : "  "}{action.label}{action.description ? ` · ${action.description}` : ""}
		</Text>
	))}</Box>;
};
```

- [ ] **Step 4: Implement the score header and landing action list**

Render score, score label, project name, `summary.total`, errors, warnings, and info. Build actions in this order: Review when findings exist, HTML report, CI when missing, handoff when findings exist, Markdown, Quit. Use uppercase section labels and the approved colors; keep every line width-bounded with Ink's `wrap="truncate-end"`.

```tsx
const groups = groupFindings(result.diagnostics, "category");
const actions: ActionItem[] = [
	...(result.summary.total > 0 ? [{ id: "review", label: `Review ${groups.length} failed rules`, onSelect: onReview }] : []),
	{ id: "report", label: "Open the HTML report", onSelect: onOpenReport },
	...(canAddCi ? [{ id: "ci", label: "Add to GitHub Actions", onSelect: onAddCi }] : []),
	...(result.summary.total > 0 ? [{ id: "handoff", label: "Hand off to an agent", onSelect: onHandoff }] : []),
	{ id: "markdown", label: "Copy findings as markdown", onSelect: onCopyMarkdown },
	{ id: "quit", label: "Quit", onSelect: onQuit },
];
```

- [ ] **Step 5: Add keyboard and conditional-action assertions**

Add tests that Down + Enter selects HTML report, q calls `onQuit`, zero findings omit Review/Handoff, `canAddCi={false}` omits CI, and feedback renders in green/yellow/red according to tone.

- [ ] **Step 6: Run landing tests and typecheck**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-landing.test.tsx && pnpm --filter nestjs-doctor typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Score and actions**

```bash
git add packages/nestjs-doctor/src/cli/interactive/tui packages/nestjs-doctor/tests
git commit -m "feat(cli): add the score and actions screen"
```

### Task 4: Build width-bounded detail content and Wide review

**Files:**
- Modify: `packages/nestjs-doctor/src/cli/interactive/code-frame.ts`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/detail-lines.ts`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/findings-viewer.tsx`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-detail.test.ts`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-viewer.test.tsx`
- Modify: `packages/nestjs-doctor/tests/unit/interactive-detail.test.ts`

**Interfaces:**
- Produces: `CodeFrameRow { kind: "context" | "caret" | "target"; text: string }` and `buildCodeFrameRows`.
- Produces: `DetailLine { tone: "bad" | "dim" | "error" | "good" | "info" | "normal" | "warning"; text: string }` and `buildDetailLines(group, occurrence, width, unicode)`.
- Produces: `FindingsViewer` with controlled `onBack`, `onCopy`, and `onQuit` callbacks.

- [ ] **Step 1: Write detail ordering, schema, and width tests**

```ts
import type { SchemaDiagnostic } from "../../src/common/diagnostic.js";
import { groupFindings } from "../../src/cli/interactive/findings-model.js";
import { makeCodeDiagnostic } from "../helpers/result.js";

const groupWithExamples = groupFindings([makeCodeDiagnostic()], "category")[0];
const schemaDiagnostic: SchemaDiagnostic = {
	category: "schema",
	entity: "User",
	filePath: "/app/src/user.entity.ts",
	help: "Add a primary key.",
	message: "User has no primary key.",
	rule: "schema/require-primary-key",
	severity: "error",
};
const schemaGroup = groupFindings([schemaDiagnostic], "category")[0];

it("orders finding, recommendation, guidance, docs, Bad, then Good", () => {
	const lines = buildDetailLines(groupWithExamples, 0, 70).map((line) => line.text);
	const text = lines.join("\n");
	expect(text.indexOf("WHAT FAILED")).toBeLessThan(text.indexOf("RECOMMENDATION"));
	expect(text.indexOf("RECOMMENDATION")).toBeLessThan(text.indexOf("RULE GUIDANCE"));
	expect(text.indexOf("BAD")).toBeLessThan(text.indexOf("GOOD"));
	expect(lines.every((line) => line.length <= 70)).toBe(true);
});

it("renders an entity location without asking for a line", () => {
	const lines = buildDetailLines(schemaGroup, 0, 60).map((line) => line.text).join("\n");
	expect(lines).toContain("entity User");
	expect(lines).not.toContain("undefined");
});
```

- [ ] **Step 2: Run detail tests and verify they fail**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-detail.test.ts`

Expected: FAIL because `detail-lines.js` does not exist.

- [ ] **Step 3: Split code-frame data from ANSI rendering**

```ts
export interface CodeFrameRow {
	kind: "caret" | "context" | "target";
	text: string;
}

export const buildCodeFrameRows = (
	sourceLines: SourceLine[],
	line: number,
	column: number,
	width = 200
): CodeFrameRow[] => {
	const gutterWidth = String(Math.max(...sourceLines.map((entry) => entry.line))).length;
	const rows: CodeFrameRow[] = [];
	for (const entry of sourceLines) {
		const target = entry.line === line;
		const prefix = `${target ? ">" : " "} ${String(entry.line).padStart(gutterWidth)} | `;
		rows.push({ kind: target ? "target" : "context", text: `${prefix}${entry.text}`.slice(0, width) });
		if (target && column > 0) {
			rows.push({ kind: "caret", text: `${" ".repeat(prefix.length + column - 1)}^`.slice(0, width) });
		}
	}
	return rows;
};
```

Refactor `renderCodeFrame` to map these rows through the existing highlighter so its tests and legacy output stay unchanged.

- [ ] **Step 4: Implement detail lines with shared wrapping and truncation**

Build captions and content in the spec order. `diagnostic.help` is Recommendation; `group.info.description` is Rule guidance. For samples, emit `✗ BAD`/`✓ GOOD` or ASCII equivalents, prefix every Bad code line with `- ` and every Good line with `+ `, and omit both unless both exist. Use a word wrapper for prose and hard truncation for source/example lines.

```ts
export interface DetailLine {
	text: string;
	tone: "bad" | "dim" | "error" | "good" | "info" | "normal" | "warning";
}

const severityTone = (severity: Severity): DetailLine["tone"] => severity;

const wrapDetail = (
	text: string,
	width: number,
	tone: DetailLine["tone"]
): DetailLine[] => {
	const rows: DetailLine[] = [];
	let line = "";
	for (const word of text.trim().split(/\s+/)) {
		if (line && `${line} ${word}`.length > width) {
			rows.push({ text: line.slice(0, width), tone });
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) rows.push({ text: line.slice(0, width), tone });
	return rows;
};

const appendRuleSections = (
	lines: DetailLine[],
	diagnostic: Diagnostic,
	group: FindingGroup,
	width: number,
	unicode: boolean
): DetailLine[] => {
	const symbols = terminalSymbols(unicode);
	if (isCodeDiagnostic(diagnostic) && diagnostic.sourceLines?.length) {
		lines.push(
			...buildCodeFrameRows(
				diagnostic.sourceLines,
				diagnostic.line,
				diagnostic.column,
				width
			).map((row) => ({
				text: row.text,
				tone: row.kind === "context" ? "dim" as const : "error" as const,
			}))
		);
	}
	if (diagnostic.help) {
		lines.push({ text: "RECOMMENDATION", tone: "dim" });
		lines.push(...wrapDetail(diagnostic.help, width, "normal"));
	}
	if (group.info.description) {
		lines.push({ text: "RULE GUIDANCE", tone: "dim" });
		lines.push(...wrapDetail(group.info.description, width, "normal"));
	}
	if (group.docsUrl) {
		lines.push({ text: group.docsUrl.slice(0, width), tone: "info" });
	}
	if (group.info.bad && group.info.good) {
		lines.push({ text: `${symbols.bad} BAD`, tone: "bad" });
		lines.push(...group.info.bad.split("\n").map((row) => ({
			text: `- ${row}`.slice(0, width),
			tone: "bad" as const,
		})));
		lines.push({ text: `${symbols.good} GOOD`, tone: "good" });
		lines.push(...group.info.good.split("\n").map((row) => ({
			text: `+ ${row}`.slice(0, width),
			tone: "good" as const,
		})));
	}
	return lines;
};

export const buildDetailLines = (
	group: FindingGroup,
	occurrence: number,
	width: number,
	unicode = true
): DetailLine[] => {
	const diagnostic = group.diagnostics[occurrence] ?? group.diagnostics[0];
	const safeWidth = Math.max(20, width);
	const lines: DetailLine[] = [
		{ tone: severityTone(group.severity), text: `${group.rule} ×${group.diagnostics.length}` },
		{ tone: "dim", text: `${group.category} · ${group.severity} · ${formatDiagnosticLocation(diagnostic)} · finding ${occurrence + 1}/${group.diagnostics.length}` },
		{ tone: "dim", text: "WHAT FAILED" },
		...wrapDetail(diagnostic.message, safeWidth, "normal"),
	];
	return appendRuleSections(lines, diagnostic, group, safeWidth, unicode);
};
```

Add an assertion with `buildDetailLines(groupWithExamples, 0, 70, false)` that the headings contain `[x] BAD` and `[v] GOOD`.

- [ ] **Step 5: Write the first Wide viewer test**

```tsx
const groups = groupFindings([makeCodeDiagnostic()], "category");

it("shows rules on the left and the selected detail on the right", () => {
	const view = render(
		<FindingsViewer
			columns={140}
			groups={groups}
			onBack={vi.fn()}
			onCopy={vi.fn()}
			onQuit={vi.fn()}
			rows={32}
		/>
	);
	const frame = view.lastFrame();
	expect(frame).toContain("SECURITY");
	expect(frame).toContain("no-hardcoded-secrets");
	expect(frame).toContain("WHAT FAILED");
	expect(frame).toContain("RECOMMENDATION");
	expect(frame).toContain("BAD");
	expect(frame).toContain("GOOD");
});
```

- [ ] **Step 6: Implement the Wide list/detail shell**

Use `resolveReportLayout`, category heading entries, a 38/62 horizontal `Box`, and a one-character gray divider. Render only the visible list entries and visible detail-line slice. The selected row has the Nest-red active edge and redundant severity glyph/text.

- [ ] **Step 7: Run detail, viewer, and legacy tests**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-detail.test.ts tests/unit/interactive-tui-detail.test.ts tests/unit/interactive-tui-viewer.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit Wide review rendering**

```bash
git add packages/nestjs-doctor/src/cli/interactive packages/nestjs-doctor/tests/unit/interactive-detail.test.ts packages/nestjs-doctor/tests/unit/interactive-tui-detail.test.ts packages/nestjs-doctor/tests/unit/interactive-tui-viewer.test.tsx
git commit -m "feat(cli): render findings in a wide review"
```

### Task 5: Add navigation, scrolling, occurrences, and responsive modes

**Files:**
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/use-scroll-viewport.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/tui/findings-viewer.tsx`
- Modify: `packages/nestjs-doctor/src/cli/interactive/tui/detail-lines.ts`
- Modify: `packages/nestjs-doctor/tests/unit/interactive-tui-viewer.test.tsx`
- Test: `packages/nestjs-doctor/tests/unit/interactive-tui-layout.test.ts`

**Interfaces:**
- Produces: `useScrollViewport({ itemCount, height, isSelectable, isActive, onSelectionChange })` returning `selectedIndex`, `visibleStart`, and `visibleEnd`.
- FindingsViewer owns selected entry, per-rule occurrence, focused pane, list offset, detail offset, and Compact detail state.

- [ ] **Step 1: Add failing keyboard and responsive tests**

```tsx
const viewerGroups = groupFindings(
	[
		makeCodeDiagnostic(),
		makeCodeDiagnostic({ line: 40 }),
		makeCodeDiagnostic({
			category: "correctness",
			rule: "correctness/no-fire-and-forget-async",
			severity: "warning",
		}),
	],
	"category"
);

const ViewerFixture = ({
	columns,
	rows,
	onBack = vi.fn(),
}: {
	columns: number;
	rows: number;
	onBack?: () => void;
}) => (
	<FindingsViewer
		columns={columns}
		groups={viewerGroups}
		onBack={onBack}
		onCopy={vi.fn()}
		onQuit={vi.fn()}
		rows={rows}
	/>
);

it("updates detail with arrows, skips headings, and changes occurrences", () => {
	const view = render(<ViewerFixture columns={140} rows={32} />);
	expect(view.lastFrame()).toContain("finding 1/2");
	view.stdin.write("\u001B[B");
	expect(view.lastFrame()).toContain("correctness/no-fire-and-forget-async");
	view.stdin.write("\u001B[A");
	view.stdin.write("]");
	expect(view.lastFrame()).toContain("finding 2/2");
});

it("opens and closes dedicated detail in Compact mode", () => {
	const onBack = vi.fn();
	const view = render(<ViewerFixture columns={80} rows={20} onBack={onBack} />);
	expect(view.lastFrame()).not.toContain("RULE GUIDANCE");
	view.stdin.write("\r");
	expect(view.lastFrame()).toContain("RULE GUIDANCE");
	view.stdin.write("\u001B");
	expect(view.lastFrame()).not.toContain("RULE GUIDANCE");
	expect(onBack).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run viewer tests and verify they fail**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-viewer.test.tsx`

Expected: FAIL on selection, occurrence, or Compact behavior.

- [ ] **Step 3: Implement selectable viewport movement**

Support Up/Down and j/k by one, PageUp/PageDown by one viewport, Ctrl-U/Ctrl-D by half a viewport, `gg` to first selectable entry, and `G` to last selectable entry. Category headings return false from `isSelectable`. Clamp both selection and visible start after resize.

```ts
const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.min(maximum, Math.max(minimum, value));

const findSelectable = (start: number, direction: 1 | -1): number => {
	for (let index = start; index >= 0 && index < itemCount; index += direction) {
		if (!isSelectable || isSelectable(index)) return index;
	}
	return selectedIndex;
};

const moveTo = (target: number, direction: 1 | -1) => {
	const next = findSelectable(clamp(target, 0, itemCount - 1), direction);
	setSelectedIndex(next);
	setVisibleStart((start) =>
		next < start ? next : next >= start + height ? next - height + 1 : start
	);
	onSelectionChange?.(next);
};
```

- [ ] **Step 4: Add pane focus and exact occurrence behavior**

In Wide and Stacked modes, `Tab` toggles `"list" | "detail"`; movement keys affect only the focused pane. `[` and `]` clamp the occurrence between zero and `group.diagnostics.length - 1` and reset detail scroll to zero. Enter invokes `onCopy(group)` unless Compact list is active.

- [ ] **Step 5: Render Stacked and Compact modes**

Stacked renders list, dim horizontal divider, detail slice, then status. Compact list renders no detail and Enter changes `compactScreen` from `"list"` to `"detail"`; Compact detail uses its full content height, Enter copies, and Esc returns to its list. A second Esc calls `onBack`.

- [ ] **Step 6: Add status-line and resize assertions**

Assert each mode shows only valid keys; update props from `140x32` to `100x30` and `80x20` with ink-testing-library `rerender`, then assert Wide, Stacked, and Compact content changes without negative sizes or thrown errors.

- [ ] **Step 7: Run viewer tests**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-layout.test.ts tests/unit/interactive-tui-viewer.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit responsive review controls**

```bash
git add packages/nestjs-doctor/src/cli/interactive/tui packages/nestjs-doctor/tests/unit/interactive-tui-layout.test.ts packages/nestjs-doctor/tests/unit/interactive-tui-viewer.test.tsx
git commit -m "feat(cli): add responsive review navigation"
```

### Task 6: Compose the TUI and structured post-scan actions

**Files:**
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/handoff-screen.tsx`
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/app.tsx`
- Modify: `packages/nestjs-doctor/src/cli/interactive/tui/types.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/menu.ts`
- Modify: `packages/nestjs-doctor/src/cli/interactive/handoff.ts`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-app.test.tsx`
- Modify: `packages/nestjs-doctor/tests/unit/interactive-handoff.test.ts`

**Interfaces:**
- Produces: `InteractiveApp({ context, handlers, onExit })`.
- Produces: `TuiExitRequest = { type: "quit" } | { type: "print"; text: string } | { type: "launch-agent"; agent: LaunchableAgent; prompt: string }`.
- Produces: structured action handlers that never write through a mounted Ink frame.

- [ ] **Step 1: Add the screen-transition test**

```tsx
const interactiveContext: InteractiveContext = {
	buildReportHtml: () => "<main>report</main>",
	result: makeResult({
		diagnostics: [makeCodeDiagnostic()],
		summary: {
			byCategory: {
				architecture: 0,
				correctness: 0,
				performance: 0,
				schema: 0,
				security: 1,
			},
			errors: 1,
			info: 0,
			total: 1,
			warnings: 0,
		},
	}),
	targetPath: "/app",
	version: "0.9.0",
};

const makeActionHandlers = (): InteractiveActionHandlers => ({
	addCi: vi.fn(async () => ({
		feedback: { message: "Workflow added", tone: "success" },
		kind: "feedback",
	})),
	copyFix: vi.fn(async () => ({
		feedback: { message: "Fix prompt copied", tone: "success" },
		kind: "feedback",
	})),
	copyMarkdown: vi.fn(async () => ({
		feedback: { message: "Markdown copied", tone: "success" },
		kind: "feedback",
	})),
	openReport: vi.fn(async () => ({
		feedback: { message: "Report opened", tone: "success" },
		kind: "feedback",
	})),
});

it("moves landing to review and Esc returns without rescanning", () => {
	const handlers = makeActionHandlers();
	const onExit = vi.fn();
	const view = render(
		<InteractiveApp context={interactiveContext} handlers={handlers} onExit={onExit} />
	);
	expect(view.lastFrame()).toContain("Score and actions");
	view.stdin.write("\r");
	expect(view.lastFrame()).toContain("WHAT FAILED");
	view.stdin.write("\u001B");
	expect(view.lastFrame()).toContain("Score and actions");
	expect(handlers.openReport).not.toHaveBeenCalled();
	expect(onExit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the app test and verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-app.test.tsx`

Expected: FAIL because `InteractiveApp` does not exist.

- [ ] **Step 3: Define structured action results and leave requests**

```ts
export type ActionResult =
	| { kind: "feedback"; feedback: TuiFeedback }
	| { kind: "leave"; request: TuiExitRequest };

export interface InteractiveActionHandlers {
	addCi: () => Promise<ActionResult>;
	copyFix: (group: FindingGroup) => Promise<ActionResult>;
	copyMarkdown: () => Promise<ActionResult>;
	openReport: () => Promise<ActionResult>;
}
```

- [ ] **Step 4: Refactor menu side effects into result-returning functions**

Keep `writeReportFile`, `openReportInBrowser`, `installCiWorkflow`, `buildMarkdownReport`, and `copyToClipboard`. Replace direct `log`/stdout calls used by the TUI path with `ActionResult`. A failed clipboard returns `{ kind: "leave", request: { type: "print", text } }`; report and CI failures return error feedback; successful copies/open/report writes return success feedback.

Retain small legacy adapters that translate each `ActionResult` back to Clack logs or stdout so `runLegacyInteractiveMenu` remains a real fallback.

- [ ] **Step 5: Export handoff primitives and build the Ink handoff screen**

```ts
export interface LaunchableAgent {
	binary: string;
	name: string;
}

export const detectLaunchableAgents = (): LaunchableAgent[] => {
	if (process.platform === "win32") return [];
	return KNOWN_AGENTS.filter((agent) => isCommandAvailable(agent.binary));
};

export const launchAgent = (
	agent: LaunchableAgent,
	prompt: string,
	cwd: string
): Promise<void> => new Promise((resolve) => {
	const child = spawn(agent.binary, [prompt], { cwd, stdio: "inherit" });
	child.once("error", () => resolve());
	child.once("close", () => resolve());
});
```

The handoff screen uses `ActionMenu`; selecting an agent calls `onExit({ type: "launch-agent", agent, prompt })`, while Copy tries the clipboard and emits feedback or a print request.

- [ ] **Step 6: Compose app screens and async feedback**

Use `screen: "landing" | "review" | "handoff"`, an immutable `shown = withSurface(context.result, "cli")`, and `groupFindings(shown.diagnostics, "category")`. While an action promise runs, ignore repeated Enter input and show `Working…`; after it resolves, display feedback or forward a leave request to `onExit`.

- [ ] **Step 7: Test action feedback and handoff leave requests**

Add tests for report success, CI failure, Markdown clipboard failure returning Print, agent selection returning Launch, and q returning Quit. Assert `process.exitCode` is not assigned by any component or handler.

- [ ] **Step 8: Run app and handoff tests**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-app.test.tsx tests/unit/interactive-handoff.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the composed app**

```bash
git add packages/nestjs-doctor/src/cli/interactive packages/nestjs-doctor/tests/unit/interactive-tui-app.test.tsx packages/nestjs-doctor/tests/unit/interactive-handoff.test.ts
git commit -m "feat(cli): compose the interactive result screens"
```

### Task 7: Mount safely, restore the terminal, and keep the fallback

**Files:**
- Create: `packages/nestjs-doctor/src/cli/interactive/tui/run.tsx`
- Modify: `packages/nestjs-doctor/src/cli/interactive/menu.ts`
- Modify: `packages/nestjs-doctor/tsdown.config.ts`
- Create: `packages/nestjs-doctor/tests/unit/interactive-tui-runner.test.ts`
- Modify: `packages/nestjs-doctor/tests/unit/interactive-environment.test.ts`

**Interfaces:**
- Produces: `runInteractiveTui(context): Promise<void>`.
- Preserves: `runInteractiveMenu(context)` as the symbol dynamically imported by `cli/index.ts`.
- Consumes: `TuiExitRequest` from Task 6.

- [ ] **Step 1: Write runner orchestration tests with injected session dependencies**

```ts
it("restores and remounts after printing outside the alternate screen", async () => {
	const sessions = [
		{ type: "print", text: "prompt text" } as const,
		{ type: "quit" } as const,
	];
	const mount = vi.fn(async () => sessions.shift()!);
	const write = vi.fn();
	await runInteractiveTui(context, { launchAgent: vi.fn(), mount, write });
	expect(mount).toHaveBeenCalledTimes(2);
	expect(write).toHaveBeenCalledWith("\nprompt text\n\n");
});

it("never changes an existing failed gate", async () => {
	process.exitCode = 1;
	await runInteractiveTui(context, {
		launchAgent: vi.fn(),
		mount: vi.fn(async () => ({ type: "quit" })),
		write: vi.fn(),
	});
	expect(process.exitCode).toBe(1);
});
```

- [ ] **Step 2: Run the runner test and verify it fails**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-tui-runner.test.ts`

Expected: FAIL because `tui/run.js` does not exist.

- [ ] **Step 3: Implement one alternate-screen session**

```tsx
const mountSession = async (
	context: InteractiveContext,
	handlers: InteractiveActionHandlers
): Promise<TuiExitRequest> => {
	let resolveExit!: (request: TuiExitRequest) => void;
	const requested = new Promise<TuiExitRequest>((resolve) => { resolveExit = resolve; });
	const instance = render(
		<InteractiveApp context={context} handlers={handlers} onExit={resolveExit} />,
		{ alternateScreen: true, exitOnCtrlC: false, patchConsole: false }
	);
	const exited = instance.waitUntilExit();
	try {
		const request = await Promise.race([
			requested,
			exited.then(() => ({ type: "quit" }) as const),
		]);
		instance.unmount();
		await exited;
		return request;
	} finally {
		instance.unmount();
	}
};
```

The application treats Ctrl-C as Quit through `useInput`; the `finally` path restores raw mode and the alternate screen if a component or callback throws.

- [ ] **Step 4: Implement the external-action loop**

For Quit, return. For Print, write only after the session has unmounted, then mount a fresh landing. For Launch, start the selected agent with inherited stdio only after unmount, await it, then mount a fresh landing. Capture the original `process.exitCode` before the loop and restore it after every external action.

- [ ] **Step 5: Turn the existing menu into the fallback boundary**

Rename its current body to `runLegacyInteractiveMenu`. Implement `runInteractiveMenu` as:

```ts
export const runInteractiveMenu = async (context: InteractiveContext): Promise<void> => {
	try {
		const { runInteractiveTui } = await import("./tui/run.js");
		await runInteractiveTui(context);
	} catch (error) {
		log.warn(`Interactive viewer unavailable: ${error instanceof Error ? error.message : String(error)}`);
		await runLegacyInteractiveMenu(context);
	}
};
```

Keep `cli/index.ts`'s existing dynamic import of `interactive/menu.js`; do not statically import React or Ink there.

Add a stable second CLI entry so the packed smoke test can prove the TUI module ships:

```ts
	{
		entry: {
			"cli/index": "src/cli/index.ts",
			"cli/interactive/tui/run": "src/cli/interactive/tui/run.tsx",
		},
		format: ["esm"],
		banner: { js: "#!/usr/bin/env node" },
		clean: false,
		minify: true,
	},
```

- [ ] **Step 6: Add fallback, Ctrl-C, and no-TUI gate tests**

Mock the TUI import/session to reject and assert legacy menu is called after the warning. Assert Ctrl-C returns Quit and calls unmount. Extend environment tests so JSON, score, pipes, CI, coding agents, dumb terminals, and missing raw mode all remain false; this is the proof that React/Ink cannot load on those paths.

- [ ] **Step 7: Run all interactive tests**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-*.test.{ts,tsx}`

Expected: PASS.

- [ ] **Step 8: Typecheck and build to verify the lazy TUI chunk**

Run: `pnpm --filter nestjs-doctor typecheck && pnpm --filter nestjs-doctor build`

Expected: PASS; `dist/cli/interactive/tui/run.mjs` exists, and `node packages/nestjs-doctor/dist/cli/index.mjs --score packages/nestjs-doctor/tests/fixtures/basic-app` prints one number without terminal control sequences.

- [ ] **Step 9: Commit the runner integration**

```bash
git add packages/nestjs-doctor/src/cli packages/nestjs-doctor/tests/unit/interactive-tui-runner.test.ts packages/nestjs-doctor/tests/unit/interactive-environment.test.ts
git commit -m "feat(cli): launch the dynamic result viewer"
```

### Task 8: Document, package, and verify the release

**Files:**
- Modify: `packages/website/src/app/docs/reference/cli/page.mdx`
- Modify: `packages/nestjs-doctor/scripts/smoke-packed-install.mjs`
- Create: `.changeset/dynamic-cli-viewer.md`

**Interfaces:**
- Documents the Score and actions → Review → Wide/Stacked/Compact flow and exact controls.
- Verifies the packed package can execute both a non-interactive path and load the TUI module.

- [ ] **Step 1: Update the CLI reference with the new flow**

Replace the append-only menu description with: interactive scans open Score and actions; Review opens rule-grouped live detail; Wide is `>=120x22`, Stacked handles medium terminals, Compact opens detail separately; list the movement, occurrence, pane-focus, copy, Esc, and q controls. Keep the non-interactive gate paragraph and whole-project score caveat.

- [ ] **Step 2: Extend the packed-install smoke test**

After locating `cli`, verify the built TUI code is importable from the installed package without starting raw mode:

```js
const tui = join(
	project,
	"node_modules",
	"nestjs-doctor",
	"dist",
	"cli",
	"interactive",
	"tui",
	"run.mjs"
);
run("node", ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(tui).href)})`], project);
```

Import `pathToFileURL` from `node:url` in the smoke script. Task 7's second tsdown entry makes this path stable.

- [ ] **Step 3: Add the patch changeset**

```md
---
"nestjs-doctor": patch
---

Interactive console scans now open a responsive terminal UI. Score and actions leads to a live rule-grouped review with occurrence navigation, code, recommendations, rule guidance, and tested Bad/Good examples; non-interactive and machine-readable output is unchanged.
```

- [ ] **Step 4: Run the focused package and documentation checks**

Run: `pnpm --filter nestjs-doctor exec vitest run tests/unit/interactive-*.test.{ts,tsx} && pnpm --filter nestjs-doctor run smoke:packed`

Expected: PASS.

- [ ] **Step 5: Run the repository completion gate**

Run: `pnpm check && pnpm typecheck && pnpm test && pnpm build`

Expected: PASS. Advisory refresh warnings may appear when GitHub's advisory API is unavailable, but no test or command may fail.

- [ ] **Step 6: Inspect the final diff and published dependency boundary**

Run: `git diff --check && pnpm knip && git status --short`

Expected: no whitespace errors, Knip passes, and only planned source, test, docs, dependency, lockfile, and changeset files remain.

- [ ] **Step 7: Commit documentation and release metadata**

```bash
git add packages/website/src/app/docs/reference/cli/page.mdx packages/nestjs-doctor/scripts/smoke-packed-install.mjs .changeset/dynamic-cli-viewer.md
git commit -m "docs(cli): document the dynamic result viewer"
```
