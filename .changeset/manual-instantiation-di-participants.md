---
"nestjs-doctor": patch
---

Report manual instantiation only for classes NestJS can inject.

`architecture/no-manual-instantiation` matched on a name suffix — `Service`,
`Repository`, `Gateway`, `Resolver`, `Guard`, `Interceptor`, `Pipe`, `Filter` —
and never checked whether the class was a provider. Its own description says
otherwise:

> Do not manually instantiate **@Injectable** classes — use NestJS dependency injection

and its help asks for something impossible when the class is not yours:

> Register the class as a provider in a module and inject it via the constructor

So `new ValidationPipe({ whitelist: true })`, straight out of the NestJS docs,
was an **error**. So was every plain domain class whose name happened to end in
`Service`, and every builder called with a runtime argument.

Across 189 public projects the rule fired 97 times: 30 on classes NestJS
actually instantiates, 58 on plain classes declared in the project, 9 on classes
from `node_modules`.

The rule now consults the set of classes NestJS treats as DI participants —
`@Injectable`, `@Controller`, `@Resolver`, `@WebSocketGateway` — gathered once
per run and handed to file rules alongside the existing guard facts. 97 findings
become 28, and what remains is hand-built `LoggerService`, `RedisService`,
`ConfigService`, `ConfigRepository`.

The `bad-architecture` fixture gains an `@Injectable()` on `OrderValidatorService`,
which is what makes it the violation the fixture means it to be.

Closes #188.
