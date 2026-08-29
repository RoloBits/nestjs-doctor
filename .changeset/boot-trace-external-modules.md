---
"nestjs-doctor": patch
---

### Fixed

- The boot trace listed every class from a package module (`TypeOrmCoreModule`, `TypeOrmModule`, `BullModule`, `ConfigHostModule`) in one `unattributed` group, which hid the `DataSource` that owns most of a boot. Those classes now group under the module name the dump gives them, with an `external` tag. Instances that share a name, such as one `TypeOrmModule` per `forFeature`, merge into one group. The hover card names the module that imports a non-global package module when exactly one does.
- A user module whose name repeats, in the dump or across a monorepo's projects, groups under its bare name with an `ambiguous` tag instead of `unattributed`.

### Behavior changes

- The `--timings` warning about module names that appear more than once is gone. Those classes group under that name in the trace and still do not attach to a graph module node.
- `--format report-json` trace nodes carry `module` and, when known, `via`.
