---
"nestjs-doctor": minor
---

Rework the agent skills so they fire on their own and cover a slow boot.

The main skill carried `disable-model-invocation: true` and a description
saying what it does rather than when to use it, so an agent that had just
written NestJS code never reached for it. Both are fixed, and it now leads
with the `--scope changed` regression check instead of a fix menu.

Adds a `nestjs-boot-trace` skill for `--timings`: check the Nest version,
instrument `main.ts`, capture one boot, read the cascade, then revert.

`AGENTS.md` is now derived from the skill body instead of being a separate
stub, so the six agents that only receive `AGENTS.md` get the real guidance
rather than eight lines, and the two can no longer drift.

Re-running `--init` now updates Windsurf. It matched on a bare heading and
returned early, so any user who had installed once never received another
change. The block is delimited and replaced in place.
