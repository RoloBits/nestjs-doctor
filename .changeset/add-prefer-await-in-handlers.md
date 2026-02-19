---
"nestjs-doctor": minor
---

Add `prefer-await-in-handlers` rule and expand default exclude patterns

- **prefer-await-in-handlers**: New correctness rule that flags async HTTP handlers in `@Controller()` classes missing `await`. Unawaited service calls risk broken stack traces, missed exception filters, and inconsistent error handling. The existing `no-async-without-await` rule now skips controller handler methods to avoid overlap.
- **Default excludes**: Added `mock/`, `mocks/`, `*.mock.ts`, `seeder/`, `seeders/`, `*.seed.ts`, and `*.seeder.ts` to the default exclude patterns so mock and seeder files are not scanned.
