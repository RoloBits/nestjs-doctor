---
description: "Draft a GitHub issue (bug, rule proposal, or task) with evidence from the owning nd-* domain agent, check for duplicates, STOP for approval, then create it via gh. Nothing is created without an explicit 'go'."
argument-hint: "<free-text description of the bug, rule idea, or task>"
# Creates issues in a public repository. Only a human starts this.
disable-model-invocation: true
---

You are running the `/nd:ticket` workflow on behalf of a developer.

Their input is: `$ARGUMENTS`

If `$ARGUMENTS` is empty, stop and print:

```
Usage: /nd:ticket <free-text description of the bug, rule idea, or task>

Examples:
  /nd:ticket no-unused-module-exports fires on @Global() modules
  /nd:ticket we should flag @Injectable classes with a constructor that throws
  /nd:ticket the HTML report's schema tab is unreadable on a 4k display

The issue is drafted here first. Nothing is created until you approve.
```

One strict human gate: **nothing is created until the developer explicitly approves the draft.**

---

## Step 1: Classify

Infer three things. All appear in the draft header and can be overridden at the gate.

**Area** — which subsystem owns this: `rules`, `engine`, `schema`, `cli`, `report`, `lsp`/`vscode`, `action`, `website`, or cross-cutting. Derive candidates from `ls .claude/agents/` plus the package list — don't trust a hardcoded list.

**Type** —

| Signal | Type | Template |
|---|---|---|
| A rule misfires, the CLI crashes, output is wrong | Bug | `.github/ISSUE_TEMPLATE/bug_report.yml` |
| A new built-in rule | Rule proposal | `.github/ISSUE_TEMPLATE/rule_proposal.yml` |
| Chore, refactor, docs, CI, tooling | Task | blank issue |

A **false positive is a bug, not a rule proposal.** The distinction matters: a rule proposal asks for new detection, a bug says existing detection is wrong.

## Step 2: Gather evidence

**Domain agent consult** — if Step 1 identified an area with a matching `nd-*` agent, consult it via the `Agent` tool. Ask for what the issue needs, not a tour: the exact rule id and file, the scope it runs at, what the AST shape looks like, known footguns, and for a bug where the failure surfaces.

For a rule bug, the single most useful piece of evidence is **the smallest source file that triggers it**. Get one. A snippet beats three paragraphs of description.

Timebox this. Two or three greps and one agent consult, not an investigation. If the evidence isn't at hand, write the issue with what's known and note the open question.

## Step 3: Duplicate check

```bash
gh issue list --state all --search "<2-3 key terms>" --limit 10 --json number,title,state
```

Show near-matches under "Possibly related". A match does not block the draft — the developer decides at the gate whether to comment on the existing issue instead.

## Step 4: Draft

**Title**: one line, concrete. "no-unused-module-exports fires on @Global() modules" beats "Issue with unused exports rule". Lead with the rule id when there is one.

**Body** — the issue must stand on its own. A reader gets the full context and the expected outcome without opening anything else.

Four sections, in this order:

1. **Context** — what part of the tool this lives in and why it matters. 2–4 sentences. Name the real rule ids, files, scopes.
2. **Problem** (bug) or **Goal** (rule proposal / task) — what is wrong or what should exist. Concrete: the input, the wrong outcome, the actual message. Not "sometimes misfires" but "flags `DRIZZLE` as unused even though three repositories inject it, because the rule only walks explicit `imports` arrays".
3. **A dynamic section, titled for what the implementer needs:**
   - Rule bug → `Reproduction` (the smallest source file that triggers it, plus the actual vs expected diagnostic)
   - Rule proposal → `What should be flagged` **and** `What must NOT be flagged` — the second is what separates a useful rule from a noisy one
   - Engine/CLI bug → `Evidence` (command, flags, actual output)
   - Platform bug → `Environment` (OS, Node version, and why it's platform-specific)
   - Task → `Where it goes` (files, existing patterns to follow)
4. **Acceptance criteria** — a short checklist of observable behaviour someone can verify against a build. "Running the CLI on the fixture reports 0 findings for that rule"; "the diagnostic points at the decorator, not the class". Not "PR merged", "tests pass", "code refactored" — those are steps, not outcomes.

**Style rules, non-negotiable:**

- Plain sentences. Evidence, not adjectives. Banned: leverage, robust, comprehensive, ensure, seamless, crucial, delve.
- Short sections. Under ~250 words unless the evidence genuinely needs more.
- No emoji, no AI attribution, no "Generated with" footer, no scaffolding beyond the four headings. It reads like the developer wrote it.
- Code in fenced blocks with a language tag. A reproduction is code, not prose.

## Step 5: Approval gate — STOP and ASK

Present the header (area, type, template, any close classification calls), the full draft, and any possibly-related issues.

```
**What you can do:**
- 'go' / 'approved' / 'create it' → I create the issue
- 'edit <section>: <what>' → I redraft and re-present
- 'make it a bug/rule proposal/task' → reclassify
- 'cancel' → nothing is created
```

Then STOP. **Never create without an unambiguous yes.**

## Step 6: Create (only on approval)

```bash
gh issue create --title "<title>" --body-file <path> --label "<label>"
```

Labels: `bug` for bugs, `rule proposal` for rule proposals, none for tasks unless one clearly fits. Check `gh label list` first — never invent a label that doesn't exist.

Report the issue number and URL.

## Guard rails

- **Nothing is created before the Step 5 approval.**
- No bot attribution in the issue body.
- Never close, edit, or comment on someone else's issue as part of this command.
- If the duplicate check found an open issue that clearly covers this, say so plainly at the gate and recommend commenting instead of creating.

## What this command is NOT

- Not a bug-fixing command — it files, it doesn't fix. Use `/nd:build` for that.
- Not a way to file half-formed thoughts — if there isn't a reproduction or a clear observable outcome, say so at the gate rather than padding the issue.
