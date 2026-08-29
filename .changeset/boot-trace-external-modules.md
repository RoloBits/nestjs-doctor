---
"nestjs-doctor": patch
---

### Fixed

- **Package classes in the boot trace.** Every timed class now sits under the module that owns it in the dump. Classes from package modules (`TypeOrmCoreModule`, one `TypeOrmModule` per `forFeature`, `BullModule`, `ConfigHostModule`) get their own groups with an `external` tag instead of one `unattributed` list, so the `DataSource` that owns most of a boot is no longer hidden. The hover card names the module that imports a package module when there is exactly one.

### Behavior changes

- The `--timings` warning about module names that appear more than once in the dump is gone; those classes are no longer dropped.
- `--format report-json` trace nodes carry `module` and, when known, `via`.
