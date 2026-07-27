---
"nestjs-doctor": minor
---

Add diff-scoped scanning so a scan can report only what a change introduced.

`--scope full|files|lines|changed` narrows what gets **reported**; the whole
project is still analysed, so cross-file rules (module cycles, unused providers,
unused exports) stay correct. `--base <ref>` picks the revision to compare
against, `--staged` scopes to the git index for pre-commit hooks, and
`--changed-files-from <path>` accepts a pre-computed file list for CI.

`changed` scans the base revision in a temporary git worktree and subtracts the
findings that were already there, also reporting how many the change resolved.
Findings are matched on rule, file, message, and source text rather than line
number, so an unrelated edit above a finding does not make it look new. When the
base cannot be reached — a shallow CI clone, typically — the scan degrades to
`files` and warns instead of claiming a delta it never measured.

The score always reflects the whole project, whatever the scope: narrowing a
report cannot make a codebase look healthier than it is. Results gain an
optional `scope` field describing what was reported.

Git invocations run with `GIT_DIR`, `GIT_INDEX_FILE`, and the other
repository-scoping variables cleared. Git exports those to every hook it runs
and a hook's children inherit them, so `--staged` from a husky `pre-commit`
would otherwise resolve refs against the hook's repository rather than the
scanned one.
