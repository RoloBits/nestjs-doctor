---
"nestjs-doctor": patch
---

`architecture/no-orm-in-services` no longer repeats itself once per injected
repository.

The rule walks a service's constructor parameters and reports on each
`@InjectRepository()`, `@InjectModel()` or `@InjectEntityManager()` it finds.
The message it produces does not name the parameter:

> Service uses @InjectRepository() directly. Consider wrapping in a repository class.

so a service holding nine repositories produced nine identical lines on nine
consecutive lines of the same constructor. `Swetrix/swetrix`'s `UserService` is
exactly that. The advice is about the service, and reading it nine times does
not make it nine times more actionable.

Each distinct reason is now reported once per service. A service that injects
repositories, a Mongoose model and `PrismaService` still gets three findings,
because those are three different things to say.

Across 189 public projects this removes 196 findings and adds none. The set of
services flagged is unchanged, not merely its size.

One consequence worth knowing: the surviving diagnostic sits on the first
matching parameter, so an inline `nestjs-doctor-ignore-next-line` on that line
now silences the service rather than one of its repositories.
