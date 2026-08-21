---
"nestjs-doctor": minor
---

Add `nestjs-doctor ci install`, which scaffolds `.github/workflows/nestjs-doctor.yml` so the pull request review is one command away instead of a copy from the docs. The workflow runs on `pull_request` and on pushes to the default branch, checks out with `fetch-depth: 0` so the scan can reach the merge base, and carries the common action inputs commented out — the check comments and sets a status but never fails until you set `blocking` or `min-score`.

The file lands at the git repository root, so running it from a package directory in a monorepo still writes to the right place, and the command refuses to run outside a repository rather than dropping a `.github/` tree into the current directory. An existing workflow is left untouched unless `--force` is passed, and a symlink anywhere on the path is refused, so the write cannot escape the repository through one. The push trigger is keyed to the branch `origin/HEAD` points at, verified to still exist, falling back to `origin/main`, `origin/master`, then the checked out branch, and the chosen branch is printed.

Verbs are read from the positional argument rather than a citty subcommand, so `nestjs-doctor <path>` keeps working exactly as before; only `ci install` and an unrecognised `ci <verb>` are intercepted.
