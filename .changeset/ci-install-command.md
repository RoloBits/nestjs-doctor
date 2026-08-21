---
"nestjs-doctor": minor
---

Add `nestjs-doctor ci install`, which scaffolds `.github/workflows/nestjs-doctor.yml` so the pull request review is one command away instead of a copy from the docs. The workflow runs on `pull_request` and on pushes to the branch `origin/HEAD` points at, checks out with `fetch-depth: 0` so the scan can reach the merge base, and carries every action input commented out — the check comments and sets a status but never fails until you set `blocking` or `min-score`.

An existing workflow is left untouched unless `--force` is passed, and the file lands at the git repository root, so running it from a package directory in a monorepo still writes to the right place. Verbs are read from the positional argument rather than a citty subcommand, so `nestjs-doctor <path>` keeps working exactly as before; only `ci install` and an unknown `ci <verb>` are intercepted.
