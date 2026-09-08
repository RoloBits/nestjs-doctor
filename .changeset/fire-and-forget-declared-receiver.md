---
"nestjs-doctor": patch
---

`correctness/no-fire-and-forget-async` no longer guesses from a method name when the receiver's type is written down. A call like `this.socket.send(data)`, where `socket` is declared as a type the scan cannot read, was reported as an unawaited promise even though the method returns void. A receiver the class never declares still falls back to the name, which is what the check was for.
