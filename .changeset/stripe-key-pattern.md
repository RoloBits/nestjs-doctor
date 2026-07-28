---
"nestjs-doctor": patch
---

Detect API keys that carry an environment segment.

`security/no-hardcoded-secrets` matched `sk` or `pk`, one separator, then
alphanumerics. Every key Stripe issues is `sk_live_…` or `sk_test_…`, with a
second underscore, so none of them matched — nor did OpenAI's `sk-proj-…` or
Anthropic's `sk-ant-api03-…`. A committed Stripe key was blocked by GitHub's
push protection and missed here.

An added pattern allows up to two lowercase prefix segments and requires a digit
in the tail, so `sk_some_long_variable_name_here` and
`sk_module_config_provider_token` are still ignored. The existing patterns are
unchanged, so no current finding changes its message.
