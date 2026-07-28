---
"nestjs-doctor": patch
---

`architecture/no-business-logic-in-controllers` no longer reports a controller
for mapping errors to HTTP exceptions.

#182 taught the rule that a guard clause is not business logic, but it only
recognised an `if` with no `else`. The commonest way to reject a request in a
`catch` is a chain, and every branch of it throws:

```ts
} catch (e) {
  if (e instanceof GroupIdNotFoundError) {
    throw new NotFoundException('Group not found');
  } else if (e instanceof Error) {
    throw new BadRequestException(`Unexpected error: ${e.message}`);
  } else {
    throw new BadRequestException('Server error');
  }
}
```

That counted as three branches and was reported as business logic, which is the
opposite of true: translating a domain error into a status code is the HTTP
concern a controller exists for. A chain now counts as a guard when every one of
its branches only throws. A branch that does anything else still counts, so an
`else` that assigns or calls is a branch as before.

Across 189 public projects this removes 21 findings and adds none. All 21 sit in
one project, across 7 of its controllers, so the count is a weak signal of how
often this happens; the argument is the shape rather than the frequency.

The threshold is unchanged. One non-guard `if` per handler is still allowed,
which was measured against two stricter alternatives: counting every remaining
`if` adds 226 findings, and counting only branches that assign churns 49 out and
67 in, among them header parsing that belongs in a controller.
