---
"@nestjs-doctor/cli": patch
---

Stop `architecture/no-manual-instantiation` reporting provider factories (#293)

A `new X()` inside a custom provider's `useFactory` or `useValue` is NestJS
taking ownership of the instance, not a bypass of dependency injection — it is
the documented way to construct a service whose constructor arguments are only
known at runtime. The rule now skips construction inside a `useFactory`
(arrow or method shorthand) or `useValue` initializer of an object literal that
carries a `provide` key, and inside options objects handed directly to
`forRoot`/`forFeature`/`register` calls. It also no longer requires a name
suffix (`Service`, `Guard`, …) when project decorator facts already identify
the class as `@Injectable`, so unsuffixed registered classes constructed by
hand are now caught.
