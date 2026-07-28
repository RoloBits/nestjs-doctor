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
its branches only throws, written either `else if` or `else { if }`. A branch
that does anything else still counts, so an `else` that assigns or calls is a
branch as before.

A chain also counts as **one** branch rather than one per link. It used to be
counted per link, so adding a rejection made the rule likelier to fire:
`if (a) throw; else { r = 5 }` was clean while
`if (a) throw; else if (b) throw; else { r = 5 }` reported "2 if". More ways to
reject a request should never read as more business logic.

Across 189 public projects this takes the rule from 223 findings to 196 and adds
none. 21 of the 27 are error mapping in one project, across 7 of its
controllers, so the count is a weak signal of how often this happens; the
argument is the shape rather than the frequency.

The threshold is unchanged. One non-guard `if` per handler is still allowed,
which was measured against two stricter alternatives: counting every remaining
`if` takes the rule to 424, and counting only branches that assign takes it to
241 while silencing cases that should fire, among them header parsing that
belongs in a controller.
