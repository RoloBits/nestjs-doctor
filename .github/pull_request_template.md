## What changed

<!-- One or two sentences. Link the issue it closes, if there is one. -->

## Why

<!-- The problem this solves. For a rule change, the false positive or missed
     case that motivated it. -->

## Checklist

- [ ] `pnpm check && pnpm typecheck && pnpm test && pnpm build` all pass
- [ ] Tests cover both directions — code that should be flagged and similar code that must not be
- [ ] A changeset is included (`pnpm changeset add`) if this affects a published package
- [ ] Docs updated (`README.md`, `packages/website/`) if behaviour or flags changed
