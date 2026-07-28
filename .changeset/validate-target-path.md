---
"nestjs-doctor": patch
---

Fail on a target path that does not exist, and say when nothing was scanned.

The path was resolved but never checked. Pointing the CLI at a directory that
does not exist globbed a missing cwd, collected zero files, and printed:

```
  100 / 100  ★★★★★  Excellent
  No issues found!  0 files scanned  in 0ms
```

with exit code 0. A CI job with a typo in its path, a wrong `working-directory`,
or a checkout that had not produced the sources yet went green on a perfect
score for a project nobody read.

A missing path, or a path that is a file, now exits 2 with a message. When the
path is a directory but no TypeScript matched, the scan still runs and a warning
goes to stderr in every output format, next to the existing scope warnings:

```
No TypeScript files matched under /repo/apps/api. The score describes nothing.
```

Left alone: `--min-score` still passes on a zero-file scan. Making a gate fail
there is a change to exit-code policy, not a bug fix, so it is called out
separately.
