---
"nestjs-doctor": patch
---

`performance/no-unused-providers` no longer suggests deleting a provider the
framework activates for you.

The rule already knows about self-activating providers and skips a class
carrying `@Cron`, `@OnEvent`, `@Process` or `@WebSocketGateway`. It looked only
at decorators, so a provider that earns its registration by implementing a Nest
contract was reported as never injected:

```ts
@Injectable()
export class AiImageService implements OnModuleInit {
  async onModuleInit() { /* startup work */ }
}
```

Nothing injects it, and nothing should: Nest instantiates it and calls the hook.
Acting on the advice would delete the startup work.

A class implementing `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`,
`OnApplicationShutdown`, `BeforeApplicationShutdown`, `CanActivate`,
`NestInterceptor`, `ExceptionFilter`, `PipeTransform` or `NestMiddleware` now
counts as self-activating. A provider implementing an unrelated interface is
still reported.

Across 189 public projects this removes 65 findings and adds none.
