---
"nestjs-doctor": patch
---

`correctness/no-async-without-await` no longer flags a GraphQL resolver, a
WebSocket handler or a microservice handler.

The rule already exempts HTTP handlers, on the reasoning its own comment gives:
NestJS resolves the returned promise, so `async` without `await` is fine on a
route. The exemption list for other entry points held only `TsRestHandler`,
`GrpcMethod` and `GrpcStreamMethod`, so the same code under a different
transport was reported:

```ts
@Query()
async messages(@Args('roomId') roomId: string): Promise<Message[]> {
  return getMongoRepository(Message).find({ where: { roomId } });
}
```

`@Query`, `@Mutation`, `@Subscription`, `@ResolveField`, `@ResolveProperty`,
`@ResolveReference`, `@SubscribeMessage`, `@MessagePattern` and `@EventPattern`
now count the same way `@Get` does. A plain method with no await is still
reported.

The rule's own comment and help text said only ts-rest and gRPC, and only HTTP
handlers; both now name what is actually exempt.

Across 189 public projects this removes 141 findings and adds none.
