---
description: "Review a GitHub PR with the multi-agent pipeline (eligibility → parallel reviewers → per-finding confidence scoring → root-cause clustering → claim check on the drafts), draft human-style inline comments, STOP for approval, then post ONE review via gh. Nothing is published without an explicit 'go'."
argument-hint: "<PR number or GitHub PR URL>"
# Publishes comments on a public PR. Only a human starts this.
disable-model-invocation: true
---

You are running the `/nd:review` workflow on behalf of a developer.

Their input is: `$ARGUMENTS`

If `$ARGUMENTS` is empty, stop and ask for a PR number or URL.

One strict human gate: **nothing is posted to GitHub until the developer approves the drafted comments.** Present drafts, stop, wait. "go" / "approved" / "lgtm" posts; anything else iterates or cancels.

---

## Step 1: Resolve the PR

- A bare number → PR in `RoloBits/nestjs-doctor`.
- A URL containing `/pull/<n>` → extract owner/repo and number.

Capture the head SHA (`gh pr view <n> --json headRefOid`). Every later step pins to it.

## Step 2: Eligibility check

Check whether the PR is closed/merged, is a draft, is trivial or automated, or already carries a review from this pipeline. If any, report why and stop.

For a **stacked PR**, review it against its own base branch, not `main`. `gh pr view <n> --json baseRefName`. Reviewing a stacked PR against `main` surfaces the parent's changes as if they were this PR's, which wastes the whole run.

## Step 3: Context gathering (parallel)

- **CLAUDE.md discovery** — list changed files, then the root `CLAUDE.md` plus any in ancestor directories. Paths only.
- **PR summary** — title, body, head branch, head SHA, what it does. Under 30 lines.

## Step 4: Domain agent consult

`ls .claude/agents/` and check whether an `nd-*` agent owns any touched area (rules, engine, schema, cli — derive the list, don't trust this sentence). If one does, consult it via the `Agent` tool for that subsystem's invariants and known footguns, and feed the answer into the reviewer prompts.

Also read `CLAUDE.md` → "Things that bite in this repo". Path handling, git environment, and platform behaviour have each already shipped a bug here; a diff touching any of them deserves a targeted look rather than a generic one.

## Step 5: Parallel reviewers

Launch all five in one block, each with the PR number, head SHA, and repo path:

1. **CLAUDE.md compliance** — only what a relevant `CLAUDE.md` explicitly calls out (comment style, commit trailers, scoring invariants, module boundaries).
2. **Shallow bug scan** — the diff only; real bugs (logic errors, wrong variable, data loss), not nitpicks.
3. **Git history** — blame and log on touched files; changes that undo a deliberate earlier fix or guard.
4. **Past PR comments** — prior PRs on the same files; unresolved feedback that still applies. Include this PR's existing comments so we don't duplicate.
5. **Code-comment guidance** — comments in and around the changed code that impose constraints ("must be posix", "clear these before shelling out"); verify the change honors them.

Each returns issues with file, line, description, and why it was flagged.

## Step 6: Confidence scoring (one agent per issue, parallel)

Each scorer verifies its issue against the actual PR head and scores 0–100:

- **0** — false positive under light scrutiny, or pre-existing.
- **25** — might be real, could be a false positive; unverified. Stylistic issues not called out in a CLAUDE.md land here.
- **50** — verified real, but a nitpick or rare in practice.
- **75** — double-checked, very likely hit in practice; the PR's approach is insufficient, or a CLAUDE.md names it directly.
- **100** — confirmed, will happen frequently, evidence directly supports it.

Keep issues scoring **≥ 80**. Scorers return the exact file + line at the head SHA.

Filter out: pre-existing issues, anything the linter/typechecker/CI catches, general quality opinions (coverage, docs) unless a CLAUDE.md requires them, intentional behaviour changes, issues on unmodified lines.

**Scorer outputs are claims, not truth.** If two scorers assert contradictory facts, resolve it against the source before anything downstream repeats either claim.

## Step 6.5: Cluster and scope

1. **Cluster all findings — surviving and filtered — by root cause.** Two findings that are slices of one defect get ONE comment, drafted from the union of the cluster's verified facts. A filtered finding still contributes *facts*; the ≥80 bar decides what gets its own comment, not which facts are true.
2. **For platform- or data-dependent findings**, inventory the blast radius before drafting. "Only Windows hits this, because `resolve` prepends a drive" makes a comment land; "this might break on some platforms" doesn't.

## Step 7: Draft

One GitHub review: a short summary body plus one inline comment per surviving finding. Style rules, non-negotiable:

- **First person, giving an opinion.** "I think this breaks when…", "I'd use…".
- **Max 50 words per comment. One paragraph. No headers, no numbered lists, no bold labels.**
- **Never cite a line number.** `git.ts:184` reads like tool output and is wrong the moment anyone pushes. To point elsewhere: name the file (`git.ts`), quote it in a short fenced block (five lines max, verbatim from the head SHA, dedented), or describe the flow in words. The snippet is the one to reach for when the code is in a different file from the comment's anchor. A fenced block is the only thing allowed to break the one-paragraph rule and doesn't count toward the 50 words.
- **No dashes as punctuation.** Periods, commas, parentheses. File names keep their hyphens (`module-graph.ts`).
- **Concrete failure case**, not vague risk: the input, the wrong outcome, what the line actually does.
- **Suggest the fix in one clause**, don't write the patch.
- Contractions, plain words. Banned: leverage, robust, comprehensive, ensure, seamless, crucial, delve, "it's worth noting".
- Plain statements for real bugs; questions ("can we use X here?") for suggestions.
- **No emoji, no "Great work!", no sign-off, no bot footer, no "### Code review" scaffold.** It posts as the developer and reads like the developer wrote it.
- Summary body: 2–3 sentences. What you looked at, how many comments, which one matters most and why.

### Examples — match this exactly

Summary body:

> I went through the scope filtering and the git helpers and the flag wiring looks right. I left three comments I'd fix before merging. The path one worries me most because it silently reports nothing rather than failing.

Inline (bug, plain statement):

> I think this returns an empty set on Windows. `resolve` prepends the current drive, so `/src` becomes `D:\src` and the lookup never matches a project rooted at `/src`. Nothing errors, the scan just reports no findings. I'd resolve with posix rules instead.

Inline (suggestion, question form):

> Could we reuse `toRelativePath` here instead of slicing the prefix by hand? It already handles the outside-the-target case, and this version returns an absolute path when the file sits above the root.

Inline (the failure is in a different file, so quote it):

> A schema finding has no line, so this drops it silently. The type says as much:
>
> ```ts
> export interface SchemaDiagnostic extends BaseDiagnostic {
>   entity: string;
>   schemaColumn?: string;
> }
> ```
>
> I think `lines` scope should say it excludes schema findings rather than quietly returning fewer.

Counter-example, do NOT write this (same finding, rejected):

> A schema finding has no line, so scope.ts:142 drops it silently — this is a real problem for schema rules.

## Step 7.5: Claim check the drafts

The scorers verified the *findings*; nothing has verified the *words*. One agent takes the drafted summary and comments and:

1. **Extracts every factual clause** and checks it against the PR head AND against every Step 5–6 finding, kept and filtered. A filtered finding that contradicts a drafted clause blocks that draft until reworded.
2. **Verifies the fix clause.** Does the suggested pattern already exist elsewhere in the repo and disagree? If prescribing it would change shipped behaviour beyond this PR, soften to a question.
3. **Runs the style gate** on every draft including the summary. Reject and rewrite on any of: a `path/file.ext:123` citation in prose; a dash as punctuation; over 50 words; a banned word; an emoji, sign-off, bold label, or heading; a fenced block over five lines or not verbatim at the head SHA. Quote the offending substring so the rewrite is targeted.

Re-draft what fails, then re-run the check on the changed drafts only. This step edits wording; it never resurrects or kills findings.

## Step 8: Approval gate — STOP and ASK

Present each surviving finding with its score and one-line rationale, the filtered 50–79 findings as FYI, and the full drafted summary plus each inline comment with its target `path:line`.

```
**What you can do:**
- 'go' / 'approved' / 'lgtm' → I post the review
- 'fix' / 'fix <n>' → I fix on the branch instead of posting, then re-enter the loop
- 'edit <n>: <what>' → I redraft that comment and re-present
- 'drop <n>' / 'add the <filtered finding>' → adjust the set
- 'cancel' → nothing is posted
```

Then STOP. **Never post without an unambiguous yes.**

## Step 9: Post (only on approval)

1. Re-check: PR still open, head SHA unchanged (if it moved, re-verify against the new head first), and read the newest human comments — drop anything a reviewer already said.
2. Write the review JSON to the scratchpad and submit as ONE review:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --input review.json
```

```json
{
  "commit_id": "<head SHA>",
  "event": "COMMENT",
  "body": "<summary body>",
  "comments": [
    { "path": "<file>", "line": 0, "side": "RIGHT", "body": "<comment>" }
  ]
}
```

- `event` is always `COMMENT` — this pipeline never approves or requests changes.
- **Anchor gotcha:** `line` must fall inside a diff hunk or the API 422s with "Line could not be resolved". If the target is context outside every hunk, anchor on the nearest in-hunk line (check the `@@` headers via `gh pr diff <n>`) and make sure the comment still reads correctly there.

3. Report the review URL and the final comment set.

## Step 10: Convergence after fixes

A review only counts against the head it ran on. Whenever 'fix' is taken, or new commits land after the pipeline ran:

1. Run the `simplify` skill on the branch diff; commit and push anything it applies.
2. Re-run Steps 5–7.5 against the new head. Fresh findings go back through the Step 8 gate.
3. Repeat until one full iteration applies no fixes and surfaces no ≥80 findings. Cap at 3; then present what remains instead of looping.

**For a stacked PR, push the fix to the branch it belongs on.** A fix to code owned by the parent goes on the parent and merges up; putting it on the child duplicates the change and conflicts on merge.

## Guard rails

- **Nothing is posted before the Step 8 approval.** Includes reactions, single comments, and draft reviews.
- **Convergence before completion.** Never report finished while the head carries commits no simplify + review pass has cleared.
- `event` is always `COMMENT`. Never `APPROVE` or `REQUEST_CHANGES`.
- No bot attribution anywhere: no "Generated with Claude Code" footer, no 🤖, no AI scaffolding. The developer owns these words.
- Never edit or delete another user's comments. Editing our own posted comments (`gh api -X PATCH repos/<owner>/<repo>/pulls/comments/<id>`) is fine when asked.
- If the PR gained a review duplicating a finding between drafting and posting, drop the duplicate.

## What this command is NOT

- Not an approval machine — it comments; the human approves or requests changes.
- Not `/code-review:code-review` — that skill posts a bot-attributed comment immediately with no gate. This drafts in the developer's voice and always waits.
- Not a nitpick generator — anything under 80 is FYI, never posted.
