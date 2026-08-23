# Dynamic CLI design

## Goal

Turn the existing post-scan prompts into one responsive terminal UI. A scan first shows the score and available actions. Choosing Review opens a live rule list with the selected rule's finding, recommendation, guidance, and examples beside it.

The interaction follows React Doctor's rule-grouped viewer and responsive layout, while keeping nestjs-doctor's extra information: multiple occurrences, rule guidance, and tested Bad/Good examples.

## Scope

This changes only interactive console runs. JSON, SARIF, GitLab, Markdown, GitHub annotations, `--score`, pipes, CI, coding agents, exit codes, score calculation, diagnostic scoping, and the HTML report keep their current behavior.

The first version does not add search, filters, mouse input, editor integration, suppression controls, or code changes from inside the terminal UI.

## User flow

1. The scan and its progress finish as they do now.
2. The interactive result opens on **Score and actions**.
3. **Review failed rules** opens **Wide review** when the terminal is large enough.
4. Moving through the rule list updates the detail panel immediately.
5. `Esc` returns to Score and actions without rescanning. `q` exits while preserving the scan's gate-controlled exit code.

The other existing actions remain available: open the HTML report, add the GitHub Actions workflow, hand off to an agent, and copy Markdown.

## Screen model

The post-scan UI has two primary screens:

- **Score and actions** shows the whole-project score, scoped finding counts, project name, and the existing post-scan actions.
- **Review** shows grouped rules, the selected detail, and a status line with counts and key hints.

The UI uses Ink in the alternate terminal screen. The current static score summary remains the durable terminal output underneath it. Exiting restores that summary instead of leaving a full-screen viewer in shell history.

If the Ink renderer cannot start, the CLI warns and falls back to the current static summary and Clack menu. The scan result and exit code are already complete before the UI starts.

## Review data model

One list row represents one rule. Each row contains:

- rule id, category, and worst severity;
- all diagnostics for that rule;
- the selected diagnostic occurrence;
- occurrence count;
- rule description and Bad/Good examples when available;
- documentation URL for built-in rules.

Categories follow the report order: security, correctness, schema, architecture, then performance. Rules inside a category sort by severity, occurrence count, then rule id. Category headings are visible but not selectable.

Schema diagnostics use their entity location and never assume a source line. Custom rules can have no description, examples, or documentation URL; the detail omits those empty sections.

## Review layouts

The layout recalculates when terminal dimensions change.

- **Wide:** at least 120 columns and 22 rows. The rule list uses about 38% of the width and detail uses 62%, separated by a single dim border.
- **Stacked:** when Wide does not apply, the terminal has more than 23 rows, and it is at least 60 columns wide. The rule list sits above a scrollable detail area.
- **Compact:** every remaining size. The list is primary; `Enter` opens the selected rule in a dedicated scrollable detail screen.

Unlike React Doctor's viewer, detail content is not silently clipped. In Wide and Stacked layouts, `Tab` switches focus between the rule list and detail viewport. Arrow keys or `j`/`k` move the focused viewport. In Compact detail, they scroll the detail.

`[` and `]` move between occurrences of the selected rule. The rule guidance and examples stay fixed while the location, message, and source frame or entity change.

## Detail content

The selected rule renders in this order:

1. Severity, rule id, and occurrence count.
2. Category, severity, location, and occurrence position.
3. **What failed:** the diagnostic message.
4. Source frame for code diagnostics, or entity information for schema diagnostics.
5. **Recommendation:** `diagnostic.help`.
6. **Rule guidance:** the built-in rule description.
7. Documentation URL when available.
8. **Bad** and **Good** examples when both exist.

This corrects the current terminal wording, which labels the rule description as Recommendation even though the HTML report uses the diagnostic help for that purpose.

Bad and Good keep redundant text, glyph, and per-line `-`/`+` markers so the distinction survives with color disabled. Long code lines truncate to the available panel width; descriptive text wraps.

## Controls

- `Up`/`Down` or `j`/`k`: move through rules when the list is focused; scroll detail when the detail is focused.
- `PageUp`/`PageDown`, `Ctrl-U`/`Ctrl-D`, `gg`, `G`: larger list or detail jumps.
- `[`/`]`: previous or next occurrence for the selected rule.
- `Tab`: switch list/detail focus in Wide and Stacked layouts.
- `Enter`: copy the selected rule's fix prompt; in Compact list mode, first open its detail, then copy from that screen.
- `Esc`: close Compact detail or return from Review to Score and actions.
- `q`: quit the post-scan UI.

The status line always shows the controls valid for the current screen and focus.

## Visual language

The terminal UI translates the existing site and report tokens rather than copying React Doctor's presentation:

- black surface, bright neutral text, and dim gray structure;
- Nest red `#ea2845` for the active row edge and primary focus;
- report severity colors for error, warning, and info;
- report green for Good and success feedback;
- uppercase section labels, square single-line borders, and no rounded panels;
- width-stable Unicode glyphs with ASCII fallbacks on terminals that cannot render them.

The application cannot control the user's terminal font, so IBM Plex Mono remains a web/report choice rather than a terminal requirement. Color never carries meaning alone, and `NO_COLOR` remains readable.

## Architecture

### Pure model

Extract grouping, sorting, location formatting, documentation URLs, and fix-prompt generation from the current `interactive/detail.ts` into a pure findings model. The existing handoff flow imports this model instead of importing UI code.

### Ink boundary

A small imperative runner dynamically imports and mounts the Ink application only after `canPrompt` passes. It owns alternate-screen setup, raw-mode cleanup, Ctrl-C handling, renderer failure fallback, and waiting for the application to exit.

React, Ink, and their types are added only to the published CLI package. The TUI remains a lazy chunk so machine-readable and non-interactive invocations do not initialize it.

### Application state

The application owns:

- active screen;
- selected rule and selected occurrence per rule;
- list and detail viewport offsets;
- focused pane;
- copied/failed feedback;
- pending action state.

The finished scan result is immutable input. Screen changes never invoke the scanner again.

### Actions and side effects

Clipboard actions return feedback inside the mounted UI. HTML generation, browser opening, and CI installation return structured outcomes for the UI to display instead of writing through Ink's frame.

Agent handoff is different because it launches an inherited interactive process. The TUI exits and restores the terminal before starting the selected agent. Its exit does not change the scan's existing exit code.

## Failure handling

- Renderer startup failure falls back to the existing Clack menu.
- Terminal resize never produces a negative viewport; very small terminals use Compact mode.
- Clipboard failure shows a retry message and can print the prompt only after leaving the alternate screen.
- Report or CI action failure appears as inline feedback and keeps the user on Score and actions.
- Cancellation and Ctrl-C always restore raw mode and the alternate screen.
- No post-scan action writes `process.exitCode`; only `--min-score` and `--blocking` own the scan gate.

## Testing

Pure tests cover rule grouping, category/severity ordering, occurrence selection, schema diagnostics, custom rules, fix prompts, and layout thresholds.

Ink component tests cover keyboard navigation, category-header skipping, selection-driven detail updates, pane focus, scrolling, occurrence changes, Compact detail, copied/failed feedback, Esc, q, Ctrl-C, and terminal resize.

Integration tests prove:

- every non-interactive and machine-readable format stays byte-for-byte unchanged;
- interactive quitting preserves the scan's existing exit code 0 or 1, while input/configuration failures still exit 2 before any TUI opens;
- the viewer uses `withSurface(result, "cli")` while the score remains whole-project;
- monorepos use the combined scoped result without rescanning;
- color-disabled and Windows fallback symbols remain readable;
- renderer failure restores the terminal and opens the fallback menu.

Before completion, run `pnpm check && pnpm typecheck && pnpm test && pnpm build`. Add a changeset because the published CLI behavior and runtime dependencies change.
