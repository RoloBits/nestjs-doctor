---
"nestjs-doctor": patch
---

Restore the report's floating tooltip for data-tip elements in the boot trace dock, the header badges, and the module detail badges. The React port left its binding running before the containers mounted, so it never attached; it now installs as a delegated listener from the app itself.
