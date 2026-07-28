---
"nestjs-doctor": patch
---

Stop `security/no-exposed-stack-trace` flagging the remedy it recommends.

The rule looks for `error.stack` reaching a response, and treated any call
expression as a possible response — including the logging call its own help text
tells you to write:

> Log the stack trace internally and return a generic error message to the client.

```ts
this.logger.error(`Failed to run migration ${path}`, err.stack);
```

Across 76 public projects, 142 of the rule's 150 findings were stacks handed to
a logger, whether as a direct argument or inside an object passed to one.

A stack reaching any standard log level is now left alone. The eight that remain
are stacks placed into an object that is built and returned, which is the case
the rule exists for — among them an exception filter putting `stack` in its
response body and a health controller returning `trace: error.stack`.
