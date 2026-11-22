---
"nestjs-doctor": minor
---

Add the `correctness/no-legacy-nestjs-imports` rule, which flags imports and decorators that moved package or changed name across NestJS versions. `HttpModule` and `HttpService` left `@nestjs/common` for `@nestjs/axios` in Nest 5, and `@ApiUseTags`, `@ApiModelProperty` and the `@ApiImplicit*` decorators were renamed in `@nestjs/swagger` v4. Every finding names the replacement, so the fix is a one-line change instead of a trip through the release notes.
