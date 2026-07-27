---
description: Save the current conversation topic to the worklog, or recall a past one (by issue, topic, or date)
---

The worklog lives at `.claude/worklog/` — one markdown file per issue/topic with YAML frontmatter (`issue`, `topic`, `started`, `last`, `status`) and dated `## YYYY-MM-DD` sections. `INDEX.md` carries one line per file.

It is personal and gitignored. Never commit it.

Argument given: "$ARGUMENTS"

**If the argument is empty or says "save"**: save the current conversation topic.

1. Identify the issue/topic being discussed (ask only if genuinely ambiguous).
2. If a file for it exists (check `INDEX.md`), append a new `## <today>` section; otherwise create `<YYYY-MM-DD>-<issue-or-slug>.md` with frontmatter.
3. Write a summary a future session can act on: what was asked, what was found or decided (root causes, file paths, commands, PR/commit refs), what is still open. Not a play-by-play.
4. Update the file's `last:` / `status:` frontmatter and its `INDEX.md` line.

**If the argument names an issue, topic, or date/date-range**: recall it.

1. Search `INDEX.md` first, then grep file contents under `.claude/worklog/`, matching issue number, topic words, or the date range against frontmatter and `##` section dates.
2. If nothing matches, fall back to grepping raw session transcripts in `~/.claude/projects/-Users-franciscolopez-Desktop-RoloBits-nestjs-doctor/*.jsonl` (they purge after ~30 days).
3. Summarize what was done and offer to continue it.

## What is worth saving here

This repo's expensive discoveries are platform- and tooling-shaped, and they are exactly what a future session will otherwise rediscover the hard way:

- A bug that only appears on one platform, and the reason it does.
- A CI job that found something pre-existing, and what was in scope to fix versus deferred.
- Anything in `CLAUDE.md` → "Things that bite in this repo" that grew a new wrinkle.
- PR numbers and their stack order, since stacked PRs are easy to merge in the wrong sequence.
