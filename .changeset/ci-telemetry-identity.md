---
"nestjs-doctor": patch
---

Fixes CI classification in telemetry. A shared `ci.<provider>` identity is now minted only when a known provider variable matches; a bare `CI` env var keeps the personal install id and records `ci_provider: "unknown"` instead of merging the run into an anonymous machine pool. The provider table expands from 6 to 34 systems (TeamCity, Azure Pipelines, Bitbucket, CodeBuild, Drone, Render, and others), so automated runners that set none of the previous variables are no longer counted as individual users.
