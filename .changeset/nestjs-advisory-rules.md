---
"nestjs-doctor": minor
---

Report `@nestjs/*` versions with a published security advisory.

Two rules, because a rule carries one severity:

| Rule | Severity | Reports |
| --- | --- | --- |
| `security/no-vulnerable-nestjs-packages` | error | critical and high advisories |
| `security/no-advisory-nestjs-packages` | warning | moderate and low advisories |

The warning rule declares `surfaces: ["cli", "prComment"]`, so it reports in the
console and on the pull request without moving the score or failing a build. The
advisory list ships with the CLI, and a release that adds a row must not change
how anyone's unchanged project scores.

Which version gets checked, in order: the one installed under `node_modules`;
otherwise the declared range, and only when every version it admits is below the
fix; otherwise nothing. npm installs the highest version a range allows, so
`^11.0.1` is quiet because it admits the patched 11.1.18, while `^10.0.0` against
a fix that exists only in 11.1.18 is reported. Peer ranges are not read: they
constrain a consumer, not this project.

A spec naming no version, such as `workspace:*` or `11.x`, is never guessed at.
It reports as unchecked and names the package, because the same project reads as
clean before an install and finds advisories after one, and silence there is
indistinguishable from having nothing to report.

Nine advisories ship, taken from the GitHub Advisory Database: one critical in
`@nestjs/devtools-integration`, four high across `@nestjs/platform-fastify` and
`@nestjs/microservices`, and four moderate across `@nestjs/core`,
`@nestjs/common` and `@nestjs/platform-fastify`.

A scan still makes no network call. The cost is that the list is only as fresh
as the release, so `npx nestjs-doctor@latest` knows the most.

`package.json` takes no comments, so no inline directive can silence these.
Use `ignore.rules`.
