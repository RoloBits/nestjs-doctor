---
"nestjs-doctor": patch
---

Resolve statically registered global guards across workspace application module
imports, including imported provider arrays. Keep a controller reportable when
any known consuming application lacks a mandatory guard, and do not use
conditional imports, optional providers, unresolved packages or unused dynamic
registrations as proof of protection. Orphan controllers remain reportable.
