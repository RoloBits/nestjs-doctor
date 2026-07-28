---
"nestjs-doctor": patch
---

Two defects found auditing the controller rules widened this week.

**`correctness/param-decorator-matches-route` stopped running on the classes it
was widened for.** When a class carries no literal `@Controller`, the route
prefix comes from elsewhere, so the rule marks it unreadable. It then skips
every method, which made the rule a no-op on exactly the composed-decorator
classes the previous release taught it to see:

```ts
@ApiController('users/:userId')
export class UsersController {
  @Get(':id')
  find(@Param('nonexistent') x: string) {}   // matched nothing, reported nothing
}
```

The prefix now also comes from a composed decorator's string argument. A wrong
guess only adds known parameter names, so it can widen what matches and never
invent a mismatch. A class with no decorator at all still skips, since its
prefix genuinely lives on a subclass.

**`architecture/no-repository-in-controllers` reported a repository import once
per controller in the file.** The import scan sat inside the per-class loop, so
one `import { UserRepo } from '../repositories/user.repo'` in a file with three
controllers produced three identical diagnostics on the same line. Imports
belong to the file, so they are now scanned once.

Neither shows up across 189 public projects, which is why the earlier
measurements missed them. Both reproduce in a file with two controllers.
