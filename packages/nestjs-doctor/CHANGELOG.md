# nestjs-doctor

## 0.9.0

### Highlights

- **Security advisory rules** — two new rules check your installed NestJS packages against a built-in advisory list: critical and high advisories report as errors, moderate and low as warnings. Fully offline; the list ships with the CLI.
- **Diagnostic surfaces** — rules can declare where a finding belongs: console, pull request comment, score, or CI failure. The two style rules (`no-async-without-await`, `prefer-readonly-injection`) now report in the console and HTML report only. Configure any rule with `"rules": { "<id>": { "surfaces": [...] } }`.
- **Interactive terminal UI** — scans end on a score panel with a keyboard-driven findings browser: code frame, guidance, good/bad samples, docs link per finding. One keypress copies an agent-ready fix prompt or opens the findings in Claude Code, Codex, or Cursor.
- **Boot trace** — new `--timings <path>` overlays real bootstrap times onto the module graph and adds a Boot trace tab breaking down construction chains and lifecycle-hook durations.
- **`ci install`** — scaffolds `.github/workflows/nestjs-doctor.yml`, so setting up CI is one command instead of copying from the docs.
- **Agent skills** — `--init` installs skills coding agents pick up on their own, including a new boot-trace skill; re-running `--init` updates every supported editor.
- **HTML report** — schema diagrams relayouted into readable columns, tabs renamed (**Findings**, **Rule Lab**), restyled to match the docs site.

### Behavior changes

- **Scores rise by 0–12 points.** Two preference-style rules no longer count toward the score, comment on PRs, or fail builds; they still appear in the console and HTML report marked `not scored`. Add them back via the `surfaces` config if your team wants them enforced.
- A config file that fails to parse now stops the scan (exit 2) and names the file, instead of being silently ignored — a trailing comma used to drop your `minScore` gate and ignore lists.
- `--output` is now honored together with `--report`: `npx nestjs-doctor . --report --output /tmp/health.html`.

### Fixed

- Monorepo sub-project breakdowns double-counted findings on files shared between projects.
- Reports the installed NestJS version instead of the lowest version the declared range admits.
- A malformed `package.json` crashed monorepo detection; advisory checks now say when nothing could be checked (e.g. nx workspaces without per-project manifests).
- Editor/LSP on Windows: findings failed to attach to files and duplicated after the first edit.

### Docs

- README corrections and docs restructure: agent setup moved to `/docs/coding-agents`, standalone language server documented at `/docs/language-server`.

## 0.8.0

### Minor Changes

- a2bb0dd: Modules Graph overhaul: schema-style layout with a searchable project tree, resizable sidebar, in-panel module detail (grouped providers/exports, per-section tooltips, import/used-by hover highlighting with animated flow), an info popover for legend and concepts, and a module-problems drawer.

  Engine: wrapper decorators now resolve to the framework decorators they compose, so project-specific `@XxxController()` classes and `@XxxReadOneOk()` handlers are recognized as controllers and routes; bootstrap helpers like `standaloneBootstrap(RootModule)` count as application entry points; same-name `@Module` declarations union their metadata instead of last-wins; and cross-project imports no longer produce false `no-orphan-modules` findings in monorepos.

  New optional `tags` field on rule meta (builtin and custom rules): tags are stamped onto every diagnostic the rule emits. The builtin module/DI-wiring rules carry `module-graph`, which the report's problems drawer filters on. Fully additive — rules and configs without tags behave exactly as before.

## 0.7.7

### Patch Changes

- dad172d: Two-finger scrolling a diagram in the HTML report now pans instead of zooming.

  Every canvas in the report treated a wheel event as zoom, and a trackpad sends
  one for a plain two-finger scroll, so trying to move around the diagram zoomed it
  instead. A pinch arrives as a wheel event with `ctrlKey` set, which is what now
  zooms. This matches how the rest of the diagram already behaves, since dragging
  the background has always panned.

  Applies to all three diagrams: the modules graph, the endpoints graph and the
  relational schema. On a mouse, the wheel now scrolls the diagram and ctrl or
  command with the wheel zooms.

- dad172d: Three additions to the schema diagram: deselecting by clicking away, a zoom bar,
  and a control to show every column.

  Clicking a table selected it and dimmed the rest, but the only way back was to
  click the same table again. Clicking empty canvas now clears the selection.
  Dragging the background still pans without losing it.

  The top right corner gains a zoom bar with a slider, plus and minus buttons, and
  a readout that fits the diagram to the view when clicked, so zooming no longer
  depends on a trackpad gesture.

  Tables were capped at seven columns with a "+N more" line and no way to see the
  rest. A new toolbar control shows every column, and the diagram is laid out again
  afterwards so the taller boxes do not overlap.

- dad172d: The HTML report's schema diagram can now show every table at once.

  The schema tab decided its mode at render time with `entities.length > 7` and
  never revisited it, so any schema past that size could only ever show one table
  and its direct neighbours. There was no control to leave that view, and the
  all-tables layout already existed but was unreachable. On a real 34-table schema
  you landed on an empty canvas and stayed there.

  There is now a toggle in the diagram toolbar, and a **Show all tables** button on
  the empty state itself, which is where a large schema lands.

  Tables are laid out per connected component and the components are packed
  together, because one dagre pass puts every unrelated table in a single rank. The
  same 34-table schema is 18 components with 12 tables that have no relation at
  all, so that rank was most of the diagram.

  The overview opens with columns showing, at a zoom where they are readable,
  anchored at the top left so you pan through the diagram rather than starting in
  the middle of it. Minimising the tables switches back to the fit-everything
  bird's eye view, which can now zoom out further than the old hard floor allowed.

  Node labels are now measured once when the layout is built instead of on every
  frame, which makes panning cheaper in both modes.

- dad172d: Fixes found reviewing the schema diagram work.

  A schema of five tables or fewer laid itself out against the wrong box heights.
  The initial layout ran before the boxes were sized, so dagre spacing, the edge
  ports and the fit zoom were all computed for 52px rows and the tables then drew
  up to twice that. It sizes them first now.

  The zoom slider and the pinch gesture used different floors, so dragging the
  slider to 5% and then pinching once snapped the view back in to 20%. Both use one
  floor, and the slider covers the full range the camera allows.

  Visiting the all-tables view latched columns on for good, so going back to a
  focused table showed full column lists however many neighbours it had. Whether
  columns show is one rule again, and an explicit choice still wins.

  A foreign key column named `user_id` was marked as merely indexed, because the
  match ignored punctuation. Names are compared without it, so a renamed or
  snake_case key column reads as a foreign key.

  The two toggles keep their accessible name in step with what they do and report
  their pressed state, and the tooltips appear on keyboard focus, not only on hover.

- dad172d: The schema tab's table list can be hidden, and it follows the diagram by default.

  A button in the list header hides it so the diagram gets the whole width, and a
  button on the diagram brings it back. The view stays put across the change rather
  than jumping, because the camera shifts by half the width it gained or lost.

  A **Sync with diagram** checkbox, on by default, ties the two together. Picking a
  table in the diagram opens that table in the list, opens its columns, and scrolls
  to it. Clicking empty canvas clears the selection and closes everything. Unchecking
  it leaves the list alone, so the two can be driven separately.

  Also fixes three things in the list: the tooltips were cut off, because the list
  scrolls and so clips anything drawn outside it; a row's trailing detail such as
  `= uuid()` ran under the right edge, since the name never gave up space; and the
  new checkbox sat flush against the header.

- dad172d: The schema sidebar and the diagram now mark a column the same way.

  The diagram gained key, link and index glyphs on columns, but the sidebar tree
  still only told a primary key apart from everything else, so the same column
  could be plain in the list and marked in the diagram. `Journey.name` is indexed,
  and only one of the two views said so.

  The sidebar now classifies a column exactly as the diagram does, and its indexes
  group counts a plainly indexed column rather than only a unique one, which is why
  that group was often missing. An indexed column also picks up an `idx` tag beside
  `null`, `gen` and `uniq`.

- dad172d: A synced table now sits at the top of the list, and the list's glyphs explain
  themselves.

  Revealing a table scrolled it only far enough to be visible, so it could land
  anywhere on screen with unrelated tables above it. It is now put directly under
  the sticky header, so the table you picked reads first and its columns follow.

  The key, link and index glyphs in the list say what they mean on hover, on the
  column rows and on the keys, foreign keys and indexes entries.

- dad172d: The schema diagram's zoom bar joins the other controls on one row, every control
  explains itself on hover, and columns are marked with what they are.

  The zoom bar sat on its own line below the toolbar. It is now part of the same
  row, so the diagram controls read as one group.

  Each control had a bare label like "Expand tables", which says what it is called
  but not what it does. They now carry a name and a short line of explanation,
  shown in a tooltip styled like the rest of the report rather than the browser's
  own.

  A table's columns were an undifferentiated list. A primary key, a foreign key and
  an indexed or unique column now each carry their own glyph, matching the icons
  already used in the sidebar tree. Foreign keys are matched from the entity's
  relations, by the property name or that name with an Id suffix.

## 0.7.6

### Patch Changes

- 39952f0: A Prisma schema is now found when it does not sit in one of the two
  conventional places.

  `findPrismaSchemaFiles` checked `<project>/prisma/schema.prisma`,
  `<project>/schema.prisma`, and a `prisma.schema` field in `package.json`, then
  gave up. An Nx workspace that keeps its schema in a library, which is the normal
  shape, got nothing: the ORM was detected as Prisma, the schema graph came back
  empty, the ER diagram never rendered, and the three schema rules were skipped in
  silence. On one 9,836-file workspace that is 33 models and 36 relations that
  were never checked.

  **`prisma.config.*` is read, and read first.** Prisma treats it as authoritative
  and ignores the `package.json` key when one exists, so a declared path now beats
  both conventional locations. Comments are stripped before the path is read and
  every `schema` key in the file is tried, taking the first that declares a model,
  so neither a commented-out old path nor a nested `datasource: { schema: … }`
  wins.

  **A bounded search runs last**, only when nothing above located a schema. It
  skips `node_modules`, generated client output, scaffolding templates,
  `examples/`, `sample/`, `test/`, `e2e/` and build directories, and
  dot-directories are skipped too, which is what keeps a worktree copy out. A
  guessed directory has to declare a model and has to look like a schema's own,
  either named `prisma` or holding a `schema.prisma`; without that second rule a
  vendored reference schema stood in for the project's own in one corpus project.

  The conventional directory now also accepts a folder holding no `schema.prisma`,
  which Prisma has allowed since 5.15.

  Measured over the 46 corpus projects that hold a `.prisma` file, scanned at their
  roots: **355 entities to 419, and 223 schema findings to 261**. Four projects
  gain a schema. One drops by one entity, correctly: it declares
  `schema: 'prisma/schema.prisma'` in a `prisma.config.ts`, and the entity came
  from a `schema-old.prisma` sibling the project does not use.

  Known limitation: a project that declares nothing and keeps a stale copy beside
  its schema merges both, because Prisma merges siblings and nothing distinguishes
  a backup from a legitimate second file.

- 449eb87: A monorepo scan resolves the workspace-root schema once instead of once per
  sub-project.

  `buildSubProjectContext` falls back to the workspace root when a sub-project's
  own extraction comes back empty, and the answer is the same every time. On an Nx
  workspace with 29 Nest sub-projects it ran **28 times**, each repeating the file
  lookup across the whole tree. #217 made that lookup more expensive by giving it a
  search. The root is one path per scan, so it is now resolved once and shared.

  The fallback also no longer runs for an ORM it cannot help. Only Prisma locates
  its schema from the target path; TypeORM, Drizzle and MikroORM read the source
  files they are handed, so for those the fallback re-ran the identical extraction
  with identical inputs and could only reach the identical empty result. Each
  extractor now declares this on `OrmSchemaExtractor`, so the compiler asks for it
  when an ORM is added. On a TypeORM monorepo the root extractions drop from 2 to 0.

  No finding moves: the 46-project schema corpus is unchanged at 419 entities and
  261 findings, every repo individually, and the workspace above still reports 34
  entities, 36 relations and the same 237 diagnostics.

  This closes the follow-up #194 recorded when it added the fallback: "sharing one
  extraction across sub-projects… deduplicating the work is a separate question".

## 0.7.5

### Patch Changes

- 7befa7f: Two architecture rules stop treating any directory as a NestJS module.

  **`architecture/require-module-boundaries`** flags a relative import that reaches
  into `/entities/`, `/dto/`, `/guards/`, `/pipes/` and friends, skipping it only
  when source and target sit in the same module. It never asked whether the target
  was in a module at all, and a project's `src/` usually holds `app.module.ts`, so
  shared code counted as "another module's internals":

  ```ts
  // src/modules/sessions/sessions.controller.ts
  import { WherePipe } from "../../pipes/where.pipe"; // reported
  // src/auth/auth.service.ts
  import { ApiResponse } from "../common/dto/api-response.dto"; // reported
  ```

  Neither `pipes/` nor `common/` is a module. An import is now skipped when the
  target lies outside every module, and when the target's module _contains_ the
  source's module, which is what shared and root code looks like. A sibling module
  is still a boundary, so `db.module.ts` reaching into `auth/entities/` is
  reported as before.

  **`architecture/no-barrel-export-internals`** flags any `index.ts` re-exporting a
  `.entity`, `.guard`, `.repository` and so on. Its own help text says "only export
  the module's public API", but it ran on every folder barrel, and a
  `guards/index.ts` exporting guards is doing its job. Of 67 barrels flagged
  across the corpus, **50 sat in a directory with no module file at all** —
  `guards/`, `filters/`, `entities/`, `interceptors/`. The rule now runs only on a
  barrel beside a module file.

  Suppression needs a positive sighting, which is the invariant #150 recorded:
  "only two sides positively resolving to the same module skip the report;
  anything unknown reports as before". So an empty `moduleDirectories` means no
  module was found rather than nothing being one, and a target outside every
  module is skipped only when the scan actually holds that file. An import whose
  specifier resolves nowhere is unknown and still reported, which costs 6 findings
  against the looser version.

  Across 189 public projects: module boundaries 867 to 602, barrel exports 186 to
  26, nothing added by either.

  Of the 265 boundary findings removed, most target a shared folder holding no
  module and no provider, and about 67 are a nested module importing its parent's
  `dto/` or `entities/`. Around 16 target a folder that holds a service or
  controller but no module file. That shape is arguably a feature folder missing
  its module, which is how the `config-disable-rules` fixture below is read, and
  the rule now says nothing about it either way.

  One fixture changed. `config-disable-rules` had a `src/users/` holding a
  service, a repository and a barrel but no module, so it was a feature folder
  missing its module file; it now has one. A boundaries test used
  `/elsewhere/tool.ts` importing `../users/...`, which resolves outside the
  `/src/users` module it declared, so it was passing for the wrong reason.

- 366e182: `correctness/no-async-without-await` no longer flags a GraphQL resolver, a
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

- 479180a: `architecture/no-business-logic-in-controllers` no longer reports a controller
  for mapping errors to HTTP exceptions.

  #182 taught the rule that a guard clause is not business logic, but it only
  recognised an `if` with no `else`. The commonest way to reject a request in a
  `catch` is a chain, and every branch of it throws:

  ```ts
  } catch (e) {
    if (e instanceof GroupIdNotFoundError) {
      throw new NotFoundException('Group not found');
    } else if (e instanceof Error) {
      throw new BadRequestException(`Unexpected error: ${e.message}`);
    } else {
      throw new BadRequestException('Server error');
    }
  }
  ```

  That counted as three branches and was reported as business logic, which is the
  opposite of true: translating a domain error into a status code is the HTTP
  concern a controller exists for. A chain now counts as a guard when every one of
  its branches only throws, written either `else if` or `else { if }`. A branch
  that does anything else still counts, so an `else` that assigns or calls is a
  branch as before.

  A chain also counts as **one** branch rather than one per link. It used to be
  counted per link, so adding a rejection made the rule likelier to fire:
  `if (a) throw; else { r = 5 }` was clean while
  `if (a) throw; else if (b) throw; else { r = 5 }` reported "2 if". More ways to
  reject a request should never read as more business logic.

  Across 189 public projects this takes the rule from 223 findings to 196 and adds
  none. 21 of the 27 are error mapping in one project, across 7 of its
  controllers, so the count is a weak signal of how often this happens; the
  argument is the shape rather than the frequency.

  The threshold is unchanged. One non-guard `if` per handler is still allowed,
  which was measured against two stricter alternatives: counting every remaining
  `if` takes the rule to 424, and counting only branches that assign takes it to
  241 while silencing cases that should fire, among them header parsing that
  belongs in a controller.

- e2762ae: `security/require-guards-on-endpoints` no longer calls a guarded endpoint
  unguarded when the guard is chosen by a ternary.

  A composed auth decorator is recognised by looking for `UseGuards(...)` among
  the arguments of `applyDecorators(...)`, and the check required an argument to
  _be_ that call. It commonly is not:

  ```ts
  export function Auth(allowApiKeyAuth = false, isOptionalAuth = false) {
    return applyDecorators(
      SetMetadata(IS_OPTIONAL_AUTH_KEY, isOptionalAuth),
      allowApiKeyAuth
        ? UseGuards(MultiAuthGuard, ApiKeyRateLimitGuard, AuthenticationGuard)
        : UseGuards(JwtAccessTokenGuard, AuthenticationGuard)
    );
  }
  ```

  Both branches apply a guard, but the argument is a conditional expression rather
  than a call, so `Auth` was not recorded and every `@Auth()` endpoint was
  reported as having no guard.

  An argument now counts when it is a `UseGuards` call, when it is a ternary whose
  **both** branches apply one, or when it spreads an inline array holding one. A
  ternary that guards only one way round does not count, and neither does an
  argument that merely mentions `UseGuards` somewhere inside it, such as
  `SetMetadata('factory', () => UseGuards(G))`. Spreading a variable rather than
  an array literal is still not followed.

  This is the worst direction for a security rule to be wrong in: it says an
  endpoint is unprotected when it is protected. Across 189 public projects it
  removes 138 findings, all in one project that uses the ternary form, and adds
  none. That project still reports its 14 genuinely unguarded endpoints.

- 6d658ef: `correctness/injectable-must-be-provided` no longer asks you to register a base
  class.

  The rule reports an `@Injectable()` class that appears in no module's
  `providers`, and suggests adding it or dropping the decorator. A base class is
  neither: it is registered through every subclass that extends it, and dropping
  its `@Injectable()` breaks the constructor injection those subclasses inherit.
  `immich`'s `BaseService` is extended by 50 classes and was reported.

  A class named in an `extends` clause is now skipped. The engine already
  collected that set for `no-unused-providers`; this rule just was not using it.
  Test files are left out of the collection, so a stub such as
  `class Stub extends OrphanThing {}` in a spec cannot exempt a production class.

  Two limitations, both inherent to matching on a bare class name, which is the
  contract `collectExtendedClasses` already had: an unrelated class sharing a base
  class's name is exempted too, and a base extended only by subclasses that are
  themselves unregistered goes quiet while those subclasses are still reported.

  Across 189 public projects this removes 5 findings and adds none.

- 28c8828: `architecture/no-orm-in-services` no longer repeats itself once per injected
  repository.

  The rule walks a service's constructor parameters and reports on each
  `@InjectRepository()`, `@InjectModel()` or `@InjectEntityManager()` it finds.
  The message it produces does not name the parameter:

  > Service uses @InjectRepository() directly. Consider wrapping in a repository class.

  so a service holding nine repositories produced nine identical lines on nine
  consecutive lines of the same constructor. `Swetrix/swetrix`'s `UserService` is
  exactly that. The advice is about the service, and reading it nine times does
  not make it nine times more actionable.

  Each distinct reason is now reported once per service. A service that injects
  repositories, a Mongoose model and `PrismaService` still gets three findings,
  because those are three different things to say.

  Across 189 public projects this removes 196 findings and adds none. The set of
  services flagged is unchanged, not merely its size.

  One consequence worth knowing: the surviving diagnostic sits on the first
  matching parameter, so an inline `nestjs-doctor-ignore-next-line` on that line
  now silences the service rather than one of its repositories.

- 03f820c: `performance/no-unused-providers` no longer suggests deleting a provider the
  framework activates for you.

  The rule already knows about self-activating providers and skips a class
  carrying `@Cron`, `@OnEvent`, `@Process` or `@WebSocketGateway`. It looked only
  at decorators, so a provider that earns its registration by implementing a Nest
  contract was reported as never injected:

  ```ts
  @Injectable()
  export class AiImageService implements OnModuleInit {
    async onModuleInit() {
      /* startup work */
    }
  }
  ```

  Nothing injects it, and nothing should: Nest instantiates it and calls the hook.
  Acting on the advice would delete the startup work.

  A class implementing `OnModuleInit`, `OnApplicationBootstrap`, `OnModuleDestroy`,
  `OnApplicationShutdown`, `BeforeApplicationShutdown`, `CanActivate`,
  `NestInterceptor`, `ExceptionFilter`, `PipeTransform` or `NestMiddleware` now
  counts as self-activating. A provider implementing an unrelated interface is
  still reported.

  A namespace-qualified clause such as `implements common.PipeTransform<A, B>`
  counts too. A class that only inherits the hook from a base it extends, without
  an `implements` clause of its own, is still reported; that shape does not occur
  in the corpus.

  Across 189 public projects this removes 65 findings and adds none.

- 1ef06b6: `expandedElsewhere` now means what it says, and the report shows it.

  The endpoint trace collapses a class it has already expanded and marks the node
  so a reader can be told the calls are drawn somewhere else. Two things were
  wrong with that.

  **The flag was set on classes that were never expanded.** It is written in the
  branch that runs when a repeat finds no cached subtree, and the cache is only
  written for a class that has a provider. So `CommandBus`, `ConfigService`, a
  TypeORM `Repository`, anything the scan has no source for, got flagged on every
  occurrence after the first, pointing at a subtree that does not exist. In one
  report of a mid-sized public project, all six flagged nodes were `CommandBus`,
  which has no children anywhere in it. Across two larger projects the flag fell
  from 946 to 520 and from 6 to 0. The remaining ones are real: a class expanded
  once, reached again by another path.

  **Nothing read the flag.** A collapsed node was drawn with no children and no
  explanation, which is how a genuine leaf is drawn too. A marked node now carries
  a `↱` on the info row and says "Calls drawn at another call site" on hover. The
  marker is a glyph rather than a label because a label wide enough to read did
  not fit beside a `REPOSITORY` or `CONTROLLER` type badge, and it says "another"
  rather than "above" because the layout puts roughly a fifth of them level with
  or below the node.

  Also adds the first test over the report's client script. It is a template
  string, so `tsc` never sees it and a syntax error would only surface in a
  browser; the test parses it.

- 5e14ce0: `performance/no-orphan-modules` no longer reports a root module whose class is
  not called `AppModule`.

  The rule skips a module that `NestFactory.create()` bootstraps, and falls back
  to the name `AppModule` for projects whose bootstrap sits outside the scan. The
  fallback keys on the class name, so a root module named anything else was
  reported as never imported:

  - `ImmichAdminModule` in `immich`'s `src/app.module.ts`
  - `ApplicationModule` in `Saluki/nestjs-template`'s `src/modules/app.module.ts`

  A module declared in `app.module.ts` or `root.module.ts` is now treated as the
  root whatever the class is called. A module nobody imports under any other
  filename is still reported, `main.module.ts` included: that name reads as a
  feature's main module far more often than as an application root, and leaving it
  out costs nothing on the corpus since all four findings removed are
  `app.module.ts` paths.

  The trade this does make: a dead `src/legacy/app.module.ts` that nothing imports
  or bootstraps is now silent, and a monorepo with one `app.module.ts` per sub-app
  exempts them all, which is right while each is live.

  Across 189 public projects this removes 4 findings and adds none.

- 15cd7de: The ts-morph checker now honours a tsconfig `baseUrl`, so an entity that extends
  a base class imported as `src/common/entity/custom-base.entity` inherits its
  columns.

  `loadPathAliases` returns early when a tsconfig declares no `paths`, and
  `createAstParser` never passed `baseUrl` to the compiler options at all. A
  project that resolves bare specifiers through `baseUrl` alone therefore got no
  resolution: `gobeam/truthy` sets `"baseUrl": "./"` with no `paths`, and every
  entity extending its `CustomBaseEntity` was reported as having no primary key
  and no timestamps, though the base declares `@PrimaryGeneratedColumn`,
  `@CreateDateColumn` and `@UpdateDateColumn`.

  This is the same defect issue #154 fixed for path aliases, in the other
  resolution mode.

  Across 189 public projects the schema rules lose 19 findings: `require-primary-key`
  19 to 15, `require-timestamps` 183 to 168.

  Resolution also improves for every rule that consults the checker: **34 findings
  appear** that it could not reach before, and **12 more are retired** as false
  positives, on top of the 19 schema ones. Corpus net is +3. Spot-checked in both
  directions and correct: an unawaited `this.trackingService.trackRaceStarted()`
  was unreadable while the service's type could not be resolved, and 12
  `no-fire-and-forget-async` findings in one project turn out to name methods
  declared `void`. The same thing happened when `paths` was added in #158.

  This reaches the checker only. `buildModuleGraph` still resolves module imports
  through `resolvePathAlias`, which has no `baseUrl` fallback, so cycles, unused
  providers and unused exports stay blind on these projects: no architecture rule
  moved anywhere in the corpus. That is a separate change.

  `paths` and `baseUrl` are read in one parse rather than two, so a monorepo does
  not pay for the same tsconfig twice per sub-project.

  Peak RSS and elapsed are unchanged. Measured on the 9,836-file Nx workspace that
  motivated #198's memory work: **2,684 MB and 54.8 s before, 2,591 MB and 50.3 s
  after**, with identical findings. `baseUrl` only widens a probe within the
  scanned tree, so `skipFileDependencyResolution` still holds.

## 0.7.4

### Patch Changes

- 81a421f: Two defects found auditing the controller rules widened this week.

  **`correctness/param-decorator-matches-route` stopped running on the classes it
  was widened for.** When a class carries no literal `@Controller`, the route
  prefix comes from elsewhere, so the rule marks it unreadable. It then skips
  every method, which made the rule a no-op on exactly the composed-decorator
  classes the previous release taught it to see:

  ```ts
  @ApiController("users/:userId")
  export class UsersController {
    @Get(":id")
    find(@Param("nonexistent") x: string) {} // matched nothing, reported nothing
  }
  ```

  The prefix now also comes from a composed decorator's string argument. A wrong
  guess only adds known parameter names, so it can widen what matches and never
  invent a mismatch. A class with no decorator at all still skips, since its
  prefix genuinely lives on a subclass.

  **`architecture/no-repository-in-controllers` reported a repository import once
  per controller in the file.** The import scan sat inside the per-class loop, so
  one `import { UserRepo } from '../repositories/user.repo'` in a file with three
  controllers produced three identical diagnostics on the same line. Imports
  belong to the file, so they are now scanned once.

  Neither shows up across 189 public projects, which is why the earlier
  measurements missed them. Both reproduce in a file with two controllers.

- 7fb799f: Three rules missed cases they were written to catch. Found by working through
  the audit backlog from this week's changes, each reproduced before it was
  touched.

  **`security/no-exposed-stack-trace` treated any `.error()` call as logging.**
  The check took the last segment of the callee name, so `res.error(...)` and
  `subscriber.error(...)` counted as logging and the stack went to the client
  unreported:

  ```ts
  res.error({ stack: err.stack }); // silent
  subscriber.error(err.stack); // silent
  ```

  It also looked only at the nearest enclosing call, so wrapping the stack on the
  way to a real logger made it fire: `this.logger.error(redact(err.stack))` was
  reported as a leak. A logging call is now identified by its receiver, split into
  words so that `this._logger`, `this.logService`, `new Logger('Ctx')` and a bare
  `debug(...)` all count while `this.catalog` does not, and the search walks out
  through every enclosing call rather than stopping at the first.

  **`correctness/no-duplicate-decorators` stopped seeing repeated route
  decorators.** Non-single-use decorators are keyed by their full text so that
  `@UseInterceptors(A)` and `@UseInterceptors(B)` read as two interceptors. Route
  decorators fell into that bucket, but Nest stores one path per handler, so

  ```ts
  @Get('alpha')
  @Get('beta')
  handler() {}
  ```

  registers `alpha` and silently drops `beta`. HTTP method decorators are now
  single-use.

  **`correctness/no-fire-and-forget-async` accepted a `.catch()` that rethrows.**
  `promise.catch((e) => { throw e; })` returns a promise that rejects, so the
  rejection is still unhandled, and the same is true of the commoner shape that
  logs first:

  ```ts
  .catch((e) => { this.logger.error(e); throw e; });
  ```

  A handler that ends by throwing no longer counts as handling it, on the `catch`
  and on the second argument to `then` alike. An empty handler still does, because
  swallowing an error deliberately is a different complaint.

  Across 189 public projects this adds 9 findings, all of them rejections that
  reach the process, and removes none. The stack trace rule comes out level at 8:
  two earlier attempts at the receiver check fired on `this._logger.error(...)`,
  `new Logger('Bootstrap').error(...)`, `this.logService.error(...)` and a bare
  `debug(...)`, and the corpus caught each round. Neither a response helper
  carrying a stack nor a repeated route decorator occurs anywhere in public code,
  so those two are covered by tests rather than by a number.

- 22d3ff5: Two false negatives found auditing this week's rule changes.

  **A colon-separated value stopped being a credential.** The permission-scope
  skip was written for `password: "password:update"`, and it excluded digits so
  `admin:secretpass123` would survive. Anything else lowercase and colon-separated
  went quiet:

  ```ts
  export const authToken = "admin:supersecret";
  export const dbPassword = "root:hunter";
  export const basicAuthPassword = "admin:admin";
  ```

  `user:pass` is how basic-auth and database credentials get pasted into source.
  The skip now applies only when the first segment names the same thing as the
  binding, which is the shape it was written for. `password: "password:update"`
  and `apiKey: "apikey:rotate"` stay quiet.

  **`.catch()` with no handler counted as handled.** `correctness/no-fire-and-forget-async`
  accepted any `.catch` in the chain. A bare `.catch()` returns a promise that
  rejects with the same reason, so the rejection still reaches the process:

  ```ts
  this.repo.save({}).catch();
  ```

  A `catch` now needs an argument. `.catch(() => {})` still counts, since swallowing
  deliberately is not an unhandled rejection.

  Neither moves across 189 public projects. Both reproduce in four lines.

- 0862b0a: Scan a monorepo one sub-project at a time, and read written type names instead
  of asking the checker.

  Scanning a large Nx workspace died with `JavaScript heap out of memory`, on both
  `--report` and a plain scan, and raising `--max-old-space-size` to 8 GB did not
  save it.

  Two causes, and both were needed.

  **Every sub-project stayed alive.** `buildMonorepoContext` built all of them with
  `Promise.all` and returned them in a Map, so 43 ts-morph projects were live at
  once. Worse, `buildResult` returns the module graph and the provider map, and
  both hold `ClassDeclaration` nodes — one node anchors its source file, and
  through it the whole project and every type the checker ever resolved on it. So
  even releasing the contexts kept the memory. Sub-projects are now built,
  diagnosed and reduced one at a time, and what is kept is detached from ts-morph
  first.

  **Three rules forced full type resolution.** `no-orm-in-services`,
  `no-orm-in-controllers` and `no-repository-in-controllers` called
  `param.getType().getText()`, which makes the checker type the whole dependency
  closure — exactly the work `createAstParser` sets `skipFileDependencyResolution`
  to avoid. One 20-file sub-project cost 2.7 s and 679 MB. They now read the
  declared type node, as `no-unused-providers` already did.

  Reading the written name is also more accurate: across 194 scan targets this
  recovers 19 findings the checker's expanded form had hidden, among them
  `private readonly optionsModel: MongooseModel<Option>` and a
  `Repository<Account>` injected straight into a controller.

  The baseline scan behind `--scope changed` streams the same way, so the path
  that runs two full monorepo scans no longer holds either of them.

  A 9,800-file Nx workspace that could not be scanned at 8 GB now completes at
  1.9 GB, and its report at 1.6 GB.

- e117da8: Four ways an Nx workspace could report less than it should, all found auditing
  the monorepo detection widened this week.

  **A project whose NestJS module sorted past the twentieth was dropped.**
  Detection read at most 20 `*.module.ts` files looking for a `@nestjs/common`
  import, so a project with more module files than that could be excluded whole.
  The cap saved nothing measurable: across 152 project directories in 15 public
  Nx workspaces, no project that misses the probe has more than 20 module files.
  It is gone, and the probe now reads until it finds one.

  **Two projects declaring the same name collapsed into one.** Projects are
  recorded in a `Map` keyed by `package.json` name, then `project.json` name, then
  path. The first two are not unique, so the second project silently replaced the
  first. The name is now used only when free, and the project root, which is
  unique by construction, takes over when it is not.

  **A project nested inside another had its files counted twice.** Each project
  root is globbed independently, so `apps/api` absorbed everything under
  `apps/api/nested` while `apps/api/nested` collected it too. Every finding in the
  nested project was reported twice and the score denominator was inflated. A
  parent now excludes the roots nested under it, so a file belongs to the
  innermost project that claims it.

  **A workspace-root schema was extracted once per sub-project.** Sub-projects
  inherit the root `package.json`, so each detects the same ORM, finds no local
  schema, and falls back to the root one. Two Nest sub-projects sharing a root
  `prisma/schema.prisma` reported every entity twice. Schema entities and schema
  findings are now deduplicated when sub-project results merge.

  None of the four occurs across 189 public projects, and the corpus is unchanged
  at 13,574 findings. Each reproduces on a fixture: the probe one hides 23 files
  including a live GitHub token behind a score of 96, "Excellent".

## 0.7.3

### Patch Changes

- b357b1d: Examine route handlers declared on an undecorated base controller.

  Nest reads route metadata off the prototype chain, so a base class can hold the
  handlers while the concrete subclass carries `@Controller()`:

  ```ts
  export class DomainControllerBase<T> {          // no decorator at all
    @Get()
    async getItems(@Req() req): Promise<T[]> { return this.entityRepo.find(...); }
  }

  @Controller('/reminder/:organizationSlug/:userId')
  export class ReminderController extends DomainControllerBase<ReminderEntity> {}
  ```

  The previous release taught the controller rules to recognise a decorator that
  composes `Controller()`. This one drops the decorator requirement entirely: a
  class declaring route handlers is examined whether or not it carries anything.

  Across 211 public repositories there are 10 such classes holding 33 handlers,
  and examining them adds 35 findings — repositories injected into a controller,
  raw entities returned, endpoints with no guard.

  Two rules needed care rather than widening:

  - **`require-guards-on-endpoints`** now knows which base classes a subclass
    guards, gathered once per run beside the existing `APP_GUARD` and composed
    decorator facts. A base whose subclass carries `@UseGuards` is left alone; one
    nothing guards is reported.
  - **`param-decorator-matches-route`** treats a missing `@Controller()` as an
    unreadable prefix rather than an empty one, so a `@Param('orgId')` matching a
    prefix declared on the subclass is not reported as a mismatch.

  Closes #179.

- 0dea5be: Recognise a controller behind a composed decorator.

  Nine rules opened with `if (!isController(cls)) continue;`, and `isController`
  matches the literal name `Controller`. A project that wraps it — which NestJS
  encourages through `applyDecorators` — was invisible to all nine:

  ```ts
  export const ApiController = (path?: string) => Controller(`/api/v${API_VERSION}/${path}`);

  @ApiController('activities')
  export class ActivityController {
    @Get('/') activities(@Query() pager: ActivityQueryDto) { switch (pager.type) { ... } }
  }
  ```

  `ApiController` returns `Controller(...)`. The class is a controller in every
  sense NestJS cares about, and no rule looked at it.

  Across 189 public projects there are **58 such classes holding 358 route
  handlers**. Examining them adds 86 findings, 72 of them in `mx-space/core`:
  `switch` statements in handlers, raw entities returned, repositories injected
  into controllers.

  A class now counts when it carries `@Controller()`, or when it carries some
  class decorator and declares route handlers. A class with **no** decorator at
  all is still skipped: NestJS needs a concrete subclass to register it, and a
  guard or an injection may live there rather than on the base.

- 1b2dc5e: Recognise `@Global()` visibility and `@Inject()` tokens in
  `performance/no-unused-module-exports`.

  The rule decided who could see an export by walking explicit `imports` arrays.
  A `@Global()` module is visible to every module without an import edge, so the
  walk never found the consumer:

  ```ts
  @Global()
  @Module({ providers: [{ provide: DRIZZLE, useFactory }], exports: [DRIZZLE] })
  export class DatabaseModule {}

  @Injectable()
  export class CustomersRepository {
    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  }
  ```

  Two things were missing. A global module's consumers are every module, not its
  importers. And usage was read from constructor parameter _types_ only, so an
  `@Inject(TOKEN)` injection of a token-provided export counted for nothing.

  Across 76 public projects this takes the rule from 345 findings to 268. Closes #104.

- 325d999: Recognise every `@Inject*` token decorator in
  `correctness/require-inject-decorator`.

  The rule reports a constructor parameter with no type annotation and no
  injection token, at error severity, saying NestJS cannot resolve it. It looked
  for exactly one decorator name:

  ```ts
  const hasInject = param.getDecorators().some((d) => d.getName() === "Inject");
  ```

  Every other Nest DI decorator supplies a token the same way — `@InjectRepository`
  and `@InjectEntityManager` and `@InjectDataSource` from TypeORM, `@InjectModel`
  from Mongoose, `@InjectQueue` from Bull, and whatever a community package adds.
  So this working code was an error:

  ```ts
  constructor(@InjectRepository(Company) repo) {}
  ```

  Across 76 public projects and 16 Nest libraries the rule fires 7 times, and 6 of
  those carry `@InjectRepository`. The check now keys on the `Inject` prefix, which
  is the naming every one of these follows, rather than a list that needs a new
  entry per package. `@Optional()` on its own still reports, because it supplies no
  token.

- 3d3631d: Report manual instantiation only for classes NestJS can inject.

  `architecture/no-manual-instantiation` matched on a name suffix — `Service`,
  `Repository`, `Gateway`, `Resolver`, `Guard`, `Interceptor`, `Pipe`, `Filter` —
  and never checked whether the class was a provider. Its own description says
  otherwise:

  > Do not manually instantiate **@Injectable** classes — use NestJS dependency injection

  and its help asks for something impossible when the class is not yours:

  > Register the class as a provider in a module and inject it via the constructor

  So `new ValidationPipe({ whitelist: true })`, straight out of the NestJS docs,
  was an **error**. So was every plain domain class whose name happened to end in
  `Service`, and every builder called with a runtime argument.

  Across 189 public projects the rule fired 97 times: 30 on classes NestJS
  actually instantiates, 58 on plain classes declared in the project, 9 on classes
  from `node_modules`.

  The rule now consults the set of classes NestJS treats as DI participants —
  `@Injectable`, `@Controller`, `@Resolver`, `@WebSocketGateway` — gathered once
  per run and handed to file rules alongside the existing guard facts. 97 findings
  become 28, and what remains is hand-built `LoggerService`, `RedisService`,
  `ConfigService`, `ConfigRepository`.

  The `bad-architecture` fixture gains an `@Injectable()` on `OrderValidatorService`,
  which is what makes it the violation the fixture means it to be.

  Closes #188.

- 81d4e89: Find a workspace-root ORM schema from every sub-project.

  In monorepo mode each sub-project extracts its schema relative to its own
  directory:

  ```ts
  const schemaGraph = extractSchema(
    astProject,
    files,
    project.orm,
    projectPath
  );
  ```

  A monorepo usually keeps one schema for the whole workspace, at the root. It sits
  outside every sub-project, so no sub-project found it, and the three schema rules
  reported nothing — which reads exactly like a schema with no problems.

  `ghostfolio/ghostfolio` keeps `prisma/schema.prisma` at the repository root.
  Scanned as a single project it reports 11 schema findings; scanned as the
  monorepo it is, it reported 0, while still naming `prisma` as the detected ORM.

  A sub-project that finds no schema of its own now retries from the workspace
  root. A sub-project that owns one is unaffected.

  Separately, when an ORM is detected and the schema graph is still empty, a
  warning now goes to stderr in every format, so "found nothing" stops looking like
  "found nothing wrong".

  Closes #192.

- 96a5683: Detect Nx projects that have no `package.json` of their own.

  Nx keeps a single dependency list at the workspace root — that is its
  single-version policy — so most Nx projects have a `project.json` and no
  `package.json`. `detectNxMonorepo` required a sibling `package.json` carrying a
  direct `@nestjs/core` or `@nestjs/common` dependency, and skipped everything
  else without a word.

  On `amplication/amplication` that meant 9 of its 21 NestJS projects were
  invisible, `packages/amplication-server` among them — 794 files importing
  `@nestjs`, 59 module files. Pointing the CLI at the repository root scanned 252
  files and reported 66 findings.

  A project with no usable `package.json` now qualifies when it contains a
  `*.module.ts` that imports `@nestjs/common`. Nx workspaces routinely hold
  Angular projects, which use the same file name, so the import is what separates
  them.

  Across the 15 Nx repositories in a 189-project corpus: 3,354 files scanned
  becomes 3,963, and 1,997 findings become 2,679. Amplication alone goes from 252
  files to 1,655. The repositories that scan _fewer_ files now were previously
  running NestJS rules over Angular code — `ZenSoftware/zen` no longer reports on
  `libs/auth`, which has 40 files importing `@angular` and none importing
  `@nestjs`. Non-Nx projects are untouched.

- 26a9366: Treat a bootstrapped module as an entry point in `performance/no-orphan-modules`.

  The rule reports a module no other module imports. An application root is never
  imported, so the rule skipped one name:

  ```ts
  // Skip AppModule — it's the root and is never imported
  if (mod.name === "AppModule") {
    continue;
  }
  ```

  Anything else called dead code. `immich` bootstraps three roots and every one was
  reported:

  ```ts
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
    bufferLogs: true,
  });
  await NestFactory.create(MicroservicesModule, { bufferLogs: true });
  await NestFactory.create<NestExpressApplication>(MaintenanceModule, {
    bufferLogs: true,
  });
  ```

  The root is whichever module is handed to `NestFactory.create`,
  `createMicroservice` or `createApplicationContext`, and a project may have
  several. Those are now entry points. `AppModule` stays as a fallback for a
  project whose bootstrap file sits outside the scanned root.

  Across 76 public projects this clears 11 findings — `ApiModule`,
  `MicroservicesModule` and `MaintenanceModule` in immich, `WorkerModule` in
  vendure, plus seed, migration and CLI roots elsewhere. No other rule moves.

- 90c028f: Check class properties in `security/no-hardcoded-secrets`.

  The name-based path walked `VariableDeclaration` and `PropertyAssignment` in two
  near-identical blocks. A class field is a `PropertyDeclaration` and matched
  neither, so the most natural place to park a credential in a NestJS service was
  invisible:

  ```ts
  export class SocketConstants {
    // authentication token
    public static readonly AUTH_TOKEN = "FutureIsComing";
  }
  ```

  That one is real, in `apitable/apitable`, in `src/shared/common/constants/`.
  Across 76 public projects it is the only miss the change recovers — a small
  number, but for a security rule a miss is the failure that matters.

  The three node kinds now run through one loop with the same name test, value
  test, and the scope-string, echoed-name and thrown-message skips. No existing
  finding changes.

- b901d38: Fail on a target path that does not exist, and say when nothing was scanned.

  The path was resolved but never checked. Pointing the CLI at a directory that
  does not exist globbed a missing cwd, collected zero files, and printed:

  ```
    100 / 100  ★★★★★  Excellent
    No issues found!  0 files scanned  in 0ms
  ```

  with exit code 0. A CI job with a typo in its path, a wrong `working-directory`,
  or a checkout that had not produced the sources yet went green on a perfect
  score for a project nobody read.

  A missing path, or a path that is a file, now exits 2 with a message. When the
  path is a directory but no TypeScript matched, the scan still runs and a warning
  goes to stderr in every output format, next to the existing scope warnings:

  ```
  No TypeScript files matched under /repo/apps/api. The score describes nothing.
  ```

  Left alone: `--min-score` still passes on a zero-file scan. Making a gate fail
  there is a change to exit-code policy, not a bug fix, so it is called out
  separately.

## 0.7.2

### Patch Changes

- 188b2ea: Report the parameter's column, not its line's file offset.

  Four rules built the column from `nameNode.getStartLinePos() + 1`. That method
  returns the character offset in the file where the node's line begins, not a
  column, so the number grew with the file:

  ```
  accountRole.service.ts:19  col=773   (the line is 34 characters wide)
  ```

  Across 76 public projects, 1,367 of the 1,784 findings from these rules pointed
  past the end of their own line, the worst at column 12,645. The value reaches
  SARIF `startColumn`, GitHub annotations, the HTML report, and the language
  server, which turns it into the squiggle position in the editor.

  Affects `correctness/prefer-readonly-injection`, `architecture/no-orm-in-services`,
  `architecture/no-orm-in-controllers` and `architecture/no-repository-in-controllers`.
  A shared `columnOf()` now subtracts the line start from the node start. Diagnostic
  counts and fingerprints are unchanged — `diagnosticIdentity` never used the column.

- 08140e2: Stop the endpoint dependency trace re-expanding shared subtrees.

  `buildMethodDependencyTree` traces one node per call site, which is the point —
  call order and conditionality stay visible. But it re-expanded a callee's whole
  subtree at every path that reached it, so a diamond in the call graph grew
  multiplicatively.

  On `bookorbit/bookorbit` a single endpoint's trace held 126,708 nodes covering
  44 distinct classes, `DatabaseService` among them 33,860 times. Whole-project
  `--format json` came to 249 MB and died with an unhandled
  `RangeError: Invalid string length` from `JSON.stringify` — exit 1, no output,
  indistinguishable from a failed scan. 2 of 76 public projects crashed this way.

  A class's subtree is now expanded at its first call site in an endpoint; later
  call sites keep their own node and carry `expandedElsewhere: true`. A per-endpoint
  ceiling of 5,000 serialised nodes backs it up, and an endpoint that hits it is
  marked `truncated` and reported on stderr rather than cut silently.

  Across the same 76 projects the trace drops from 725,159 nodes to 190,614 and
  the JSON from 555 MB to 158 MB, with every diagnostic unchanged.

- 37e12c0: Stop counting guard clauses as business logic in controllers.

  `architecture/no-business-logic-in-controllers` allows one `if` and reports the
  second, on the stated basis that one is a guard clause and more is logic. It
  counted every `if` the same way, so a handler that only rejects bad input was
  reported at error severity:

  ```ts
  @Get('asset-profile/:symbol')
  public async getAssetProfile(@Param('symbol') symbol: string) {
    if (this.request.user.dailyRequests > maxDailyRequests) {
      throw new HttpException(getReasonPhrase(TOO_MANY_REQUESTS), TOO_MANY_REQUESTS);
    }
    ...
  }
  ```

  An `if` with no `else` whose branch contains only `throw` statements is now
  excluded from the count. Rejecting a request is an HTTP concern, which is what
  the rule wants left in the controller. An `if/else` still counts as a branch
  even when one arm throws, and loops and `switch` are untouched.

  Across 76 public projects this takes the rule from 257 findings to 122.

  **Fingerprint note.** The message reports the number of branching `if`s, so 37
  of the 105 surviving findings now carry a different count. The fingerprint is
  derived from the message, and it is emitted as SARIF `partialFingerprints` and
  as the GitLab code-quality `fingerprint`, so GitHub code scanning and GitLab
  will close those 37 alerts and open them again once. `--scope changed` is
  unaffected: it re-scans the base checkout with the same binary, so both sides
  carry the new message.

- d5c6dbd: Stop `correctness/no-fire-and-forget-async` reporting handled promises and
  synchronous emits.

  Two causes, 254 of the rule's 730 findings across 76 public projects.

  **A chain with a rejection handler.** The rule's help text offers `void` plus
  explicit error handling as the alternative to `await`. A `.catch()` is that
  handling, and it was reported anyway:

  ```ts
  this.allPublicArticlesCache
    .update()
    .catch((error) => this.logger.error(error));
  ```

  A statement whose chain ends in `.catch(h)`, or in a `.then(ok, fail)` with a
  rejection handler, is now left alone. A `.then(ok)` with no rejection handler
  still reports, and so does a bare `.finally()`.

  **`emit`.** It was in the name heuristic used when the return type cannot be
  resolved, but every emitter in the Nest ecosystem returns synchronously —
  `EventEmitter2.emit` gives a boolean, socket.io's gives the socket, and
  `ClientProxy.emit` gives an Observable, none of which can reject. The message
  claimed "unhandled rejections will crash the process" for
  `this.eventEmitter.emit('article.created', payload)` in 15 of the 76 projects.
  Removing it from the heuristic takes `emit` from 184 findings to the 10 whose
  return type genuinely resolves to a Promise.

  No message changes, so no fingerprint churn.

- 58f643a: Recognise HTTP handlers declared on a base class in `correctness/no-async-without-await`.

  The rule exempts HTTP handlers, because Nest resolves a returned promise itself
  so `async` without `await` is fine there. The exemption required the handler's
  own class to carry `@Controller()`:

  ```ts
  if (isController(cls) && isHttpHandler(method)) continue;
  ```

  Nest reads route metadata off the prototype chain, so the common base-controller
  pattern puts `@Get()` on a class that is never decorated and lets the concrete
  subclass carry `@Controller()`. Those handlers failed the class half of the test
  and were reported.

  Across 76 public projects there are 71 such classes declaring 404 handlers,
  producing 76 findings the rule's own comment calls valid code. The exemption now
  keys on the method, matching the `isFrameworkHandler` check directly below it,
  which never had a class gate.

- f0b5ad8: Recognise a provider whose only decorator sits on a constructor parameter.

  `correctness/no-missing-injectable` asks whether TypeScript emits
  `design:paramtypes` for the class, which is what Nest's injector reads. It
  checked for a class-level decorator, but a decorator on any constructor
  parameter triggers the same emit:

  ```ts
  export class NotificationRepository {
    constructor(@InjectKysely() private db: Kysely<DB>) {}
  }
  ```

  Compiling that with `emitDecoratorMetadata` produces the metadata, so the class
  resolves its dependencies without `@Injectable()`. It was reported anyway — 12
  times on `immich-app/immich`, which injects its Kysely connection this way
  throughout.

  A provider with constructor parameters and no decorator anywhere, the shape that
  actually fails at boot, still reports.

- 849039c: Stop `correctness/param-decorator-matches-route` reporting routes it cannot read.

  The rule stripped quotes off the decorator's first argument and treated whatever
  was left as the path. When the path is a constant rather than a literal, that
  produced an empty path, no known route parameters, and a mismatch for every
  `@Param()` on the method:

  ```ts
  @Delete(AdApiDefinition.deleteById.server)
  async deleteAd(@Request() req, @Param('id') id) {}
  ```

  > `@Param('id') does not match any route parameter. Available: (none).`

  The rule now only compares when the path is a string literal, on the method and
  on the controller alike. Across 22 public projects this removes 44 of 45
  findings — every one whose message said the available parameters were `(none)`.
  The one that remains has a literal path and is a genuine mismatch to look at.

- 3cf26f4: Detect two primary key forms the extractors were missing.

  `schema/require-primary-key` fired on entities that have one, because neither
  extractor recognised how it was declared.

  **Drizzle composite keys.** A junction table declares its key in the extras
  callback, not on a column:

  ```ts
  export const userPermissions = pgTable(
    "user_permissions",
    {
      userId: integer("user_id").notNull(),
      permissionName: varchar("permission_name").notNull(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.permissionName] })]
  );
  ```

  The extractor read that third argument only for `.on(...)` index calls. Both the
  object form and the legacy positional `primaryKey(t.a, t.b)` are now read.

  **TypeORM on Mongo.** The Mongo driver declares the key as `@ObjectIdColumn()`
  on `_id`. It was not in `COLUMN_DECORATORS`, so the column was not extracted at
  all and the entity looked keyless. Closes #108.

  Across 76 public projects this takes `require-primary-key` from 117 findings to
  70 — 30 gone in a Drizzle project, 17 in a TypeORM/Mongo one, with no other rule
  moving.

- dcbea91: Stop `security/no-exposed-stack-trace` flagging the remedy it recommends.

  The rule looks for `error.stack` reaching a response, and treated any call
  expression as a possible response — including the logging call its own help text
  tells you to write:

  > Log the stack trace internally and return a generic error message to the client.

  ```ts
  this.logger.error(`Failed to run migration ${path}`, err.stack);
  ```

  Across 76 public projects, 142 of the rule's 150 findings were stacks handed to
  a logger, whether as a direct argument or inside an object passed to one.

  A stack reaching any standard log level is now left alone. The eight that remain
  are stacks placed into an object that is built and returned, which is the case
  the rule exists for — among them an exception filter putting `stack` in its
  response body and a health controller returning `trace: error.stack`.

- ae1a5ab: Count a `useClass` target and a base class as used providers.

  `performance/no-unused-providers` decided a provider was dead if nothing injected
  it by type. Two ways of using one were invisible:

  ```ts
  const repositories: Provider[] = [
    { provide: USER_REPOSITORY, useClass: UserRepository },
  ];

  @Module({ providers: [...repositories] })
  export class UserModule {}
  ```

  Nest instantiates `UserRepository`, and a base class runs through every subclass,
  without either being a constructor dependency anywhere.

  `correctness/injectable-must-be-provided` already collected `useClass` targets,
  but only from an array literal written inline in the `@Module` decorator, so the
  common pattern of grouping providers into a const and spreading them was missed.
  That collector moves to a shared `collectProviderImplementations`, keyed on an
  object literal carrying `provide` wherever it appears, and both rules use it.

  Across 76 public projects: `no-unused-providers` 236 findings to 212, and
  `injectable-must-be-provided` 171 to 168.

## 0.7.1

### Patch Changes

- 166f35d: Two rules were reporting working code, found by scanning ten public NestJS
  projects — ghostfolio, vendure, novu, twenty, immich, amplication and four
  starters.

  `correctness/no-duplicate-decorators` flagged stacked interceptors:

  ```ts
  @UseInterceptors(RedactValuesInResponseInterceptor)
  @UseInterceptors(TransformDataSourceInRequestInterceptor)
  @UseInterceptors(TransformDataSourceInResponseInterceptor)
  ```

  Three different interceptors. `@UseInterceptors` accumulates, so stacking is the
  same as passing them in one call. The rule compared decorator names and kept an
  allowlist of things it knew repeat, which could never be complete. It now
  compares the whole decorator, so a repeat means the identical text — which is
  what a copy-paste mistake looks like. The allowlist is replaced by the opposite
  and much smaller list: the decorators a target can only carry once, like
  `@Controller` and `@Module`, where a second is wrong whatever its arguments.

  `correctness/validated-non-primitive-needs-type` asked for `@Type()` on any
  property whose type was not a primitive, including string unions:

  ```ts
  export type Granularity = "day" | "month";
  granularity: Granularity; // reported
  ```

  `@Type()` constructs a class, so a union or alias has nothing to build. The rule
  now requires the type to resolve to a class declaration, unwrapping arrays and
  unions so `AddressDto | undefined` and `Tag[]` still report.

  Across the ten projects this removes 550 findings and leaves the real ones: 44
  properties genuinely typed as a nested class with no `@Type()`.

- 6fea026: Find the project's `package.json` when scanning a subdirectory.

  `detectProject` read `package.json` from the scanned directory and nowhere else.
  Point the scanner at `apps/api/src`, which is where the code lives in a
  monorepo, and there is nothing beside it — so the ORM came back null, the Nest
  version came back null, and every schema rule was skipped without a word. All
  ten public projects used to test this hit it.

  It now reads the nearest `package.json` at or above the scanned directory,
  stopping at the repository root so a scan never adopts an unrelated parent's
  manifest.

  Seven of the ten projects now report their ORM, and five of those gain no
  findings at all — it is metadata that was missing. Two gain schema findings that
  were always there and never ran: three on `twentyhq/twenty`, and 95 on
  `vendurehq/vendure`, of which 64 are `require-primary-key` on entities that
  declare their key through a custom decorator resolved at runtime. Static
  analysis cannot see that one; it is tracked separately.

## 0.7.0

### Minor Changes

- 7157408: Remove the base64 shape detector from `security/no-hardcoded-secrets`.

  Every other pattern in that rule recognises a format someone issues: a GitHub
  token, an AWS access key, a Slack token, a JWT. This one recognised a shape —
  any forty characters of the base64 alphabet containing a digit — so everything
  base64-ish matched, and three guards had to be bolted on to make it usable:
  decode-to-JSON, a pagination-property allowlist, and an identifier heuristic.

  Those guards were the rule's two worst failures. The identifier heuristic
  cleared about a third of genuinely random keys, measured over 20,000 samples,
  and its entropy check was dead code that could not change the outcome. In the
  other direction, nine of the twelve tests covering the pattern existed only to
  suppress something it wrongly reported: migration class names, camelCase
  identifiers, pagination cursors, encoded JSON.

  Across three public repositories it found nothing at all. Every secret those
  codebases do contain is reported either by a real format pattern or by the
  property-name path, both untouched.

  What you lose: a base64 secret stored under a name that does not look like a
  secret. Under `secret`, `password` or `apiKey` the name path still catches it.

### Patch Changes

- faa9f28: Stop three rules reporting working NestJS code, all found by scanning public
  repositories.

  `correctness/no-missing-injectable` flagged CQRS handlers and queue processors.
  The rule modelled a list of decorators that "imply @Injectable", which is not
  how NestJS works: the injector reads `design:paramtypes`, and TypeScript emits
  that for a class carrying any class-level decorator. The rule now asks that
  question instead of consulting a list, so `@CommandHandler`, `@Processor` and
  every third-party or project decorator work without being enumerated. A
  provider with constructor parameters and no class decorator — the shape that
  actually fails at boot — still reports, and so does one whose only decorator is
  on a method.

  `architecture/no-manual-instantiation` flagged `new HeaderResolver(['x-lang'])`
  inside `I18nModule.forRootAsync(...)`. A `new` inside a decorator argument is
  configuration; `useValue: new X()` is documented NestJS. The skip that already
  covered guards and interceptors now covers every suffix.

  `security/no-hardcoded-secrets` flagged message keys and permission constants:
  `throw new UnprocessableEntityException({ errors: { password: 'incorrectPassword' } })`,
  `PASSWORD_UPDATE: 'password:update'`, and `SYS_USER_INITPASSWORD = 'sys_user_initPassword'`.
  Three narrow skips on the name-based path: a string handed to `throw`, a
  lowercase colon-separated scope, and a value that only restates its own name. A
  credential never matches any of the three; `correct-horse-battery-staple` and
  `super-secret-key` under a `password` property still report, and the
  pattern-based detection is untouched.

  Twelve false errors removed across the three repositories.

- 38ec6dd: Resolve base entities imported through tsconfig path aliases.

  The analysis project was built without `compilerOptions.paths`, so a base class
  imported through an alias like `~/common/entity/common.entity` resolved to
  nothing and the inheritance walk stopped before reaching it. An abstract base
  carrying `@PrimaryGeneratedColumn()` and the timestamp columns was invisible to
  every entity extending it: on `buqiyuan/nest-admin` that meant 13 false
  `schema/require-primary-key` errors and 13 false `schema/require-timestamps`
  warnings. The same gap affected MikroORM inheritance; Drizzle and Prisma never
  resolve TypeScript imports and were unaffected.

  The parser now receives the aliases the engine already loads per project. The
  TypeORM inheritance walk also stops at `node_modules`, since with aliases
  resolving the compiler can now reach `typeorm`'s own `BaseEntity` declaration.

  Better resolution cuts both ways: types the checker could not see before can
  now surface findings that were wrongly hidden. On the same repository this
  revealed four unawaited async calls and two raw-entity responses, all real.

  Projects without a tsconfig or without `paths` are untouched.

- 2bdc2c9: Detect API keys that carry an environment segment.

  `security/no-hardcoded-secrets` matched `sk` or `pk`, one separator, then
  alphanumerics. Every key Stripe issues is `sk_live_…` or `sk_test_…`, with a
  second underscore, so none of them matched — nor did OpenAI's `sk-proj-…` or
  Anthropic's `sk-ant-api03-…`. A committed Stripe key was blocked by GitHub's
  push protection and missed here.

  An added pattern allows up to two lowercase prefix segments and requires a digit
  in the tail, so `sk_some_long_variable_name_here` and
  `sk_module_config_provider_token` are still ignored. The existing patterns are
  unchanged, so no current finding changes its message.

## 0.6.1

### Patch Changes

- 144c2f1: Stop `security/require-guards-on-endpoints` reporting guarded endpoints.

  The rule looked for a literal `@UseGuards()` on the controller class or the
  route method, so two mainstream NestJS auth patterns read as no guard at all:

  - **Global guards.** `{ provide: APP_GUARD, useClass: JwtAuthGuard }` in a
    module's `providers` binds a guard application-wide. Every endpoint in the
    application was still reported.
  - **Composed decorators.** A custom `@Auth()` built from
    `applyDecorators(UseGuards(...))` was invisible, so a codebase that wraps its
    guards — and therefore never writes `@UseGuards` directly — was reported in
    full.

  Measured against three public repositories: `buqiyuan/nest-admin` drops from 72
  findings to 0, `NarHakobyan/awesome-nest-boilerplate` from 12 to the 5 endpoints
  that genuinely carry no guard, and `brocoders/nestjs-boilerplate` stays at 11,
  which are real.

  The rule only stays quiet on a positive sighting. If no module is visible — a
  scan pointed at a subdirectory, or a config that excludes the root module — it
  reports exactly as before rather than assuming a guard it cannot see.

  Two things it still cannot tell apart. An `APP_GUARD` reached through an aliased
  import is not recognised, because detection matches the token as written. And a
  module declaring `APP_GUARD` counts even when nothing imports it, so a dead
  module left in the tree suppresses the rule project-wide; separating that from a
  real root module needs the application's entry point, which a static scan of an
  arbitrary directory cannot identify.

  Module nodes now carry `providerTokens`, the `provide` tokens of object-literal
  providers. `providers` is unchanged.

- 5b3d9cd: Stop `architecture/require-module-boundaries` flagging imports that never leave
  their module.

  The rule matched any relative import containing `../` plus an internal directory
  name, without checking whether the import leaves the current module. Two kinds
  of false positive followed:

  - A module reading its **own** internals through a sibling directory —
    `mappers/file.mapper.ts` importing `../entities/file.schema`, with the module
    file right beside both. 13 of 49 findings on `brocoders/nestjs-boilerplate`.
  - Shared utilities under an application's **root** module — `common/pipes`
    importing `../dto`, `decorators` importing `../guards`. 15 of 16 findings on
    `buqiyuan/nest-admin` and 5 of 21 on `NarHakobyan/awesome-nest-boilerplate`.

  The rule now resolves the import and compares the nearest module directory of
  source and target — module directories being those holding a `*.module.ts` file
  or a `@Module()` class. Only an import whose two sides positively resolve to the
  same module is skipped; a cross-module import, an unknown side, or a project
  with no visible modules reports exactly as before.

  One consequence to know about: a project that registers everything in a single
  root module has no internal module boundaries, so folder-to-folder deep imports
  there are no longer reported. The rule reads NestJS's module structure, not the
  directory layout.

## 0.6.0

### Minor Changes

- 7fc03e8: Add diff-scoped scanning so a scan can report only what a change introduced.

  `--scope full|files|lines|changed` narrows what gets **reported**; the whole
  project is still analysed, so cross-file rules (module cycles, unused providers,
  unused exports) stay correct. `--base <ref>` picks the revision to compare
  against, `--staged` scopes to the git index for pre-commit hooks, and
  `--changed-files-from <path>` accepts a pre-computed file list for CI.

  `changed` scans the base revision in a temporary git worktree and subtracts the
  findings that were already there, also reporting how many the change resolved.
  Findings are matched on rule, file, message, and source text rather than line
  number, so an unrelated edit above a finding does not make it look new. When the
  base cannot be reached — a shallow CI clone, typically — the scan degrades to
  `files` and warns instead of claiming a delta it never measured.

  The score always reflects the whole project, whatever the scope: narrowing a
  report cannot make a codebase look healthier than it is. Results gain an
  optional `scope` field describing what was reported.

  Git invocations run with `GIT_DIR`, `GIT_INDEX_FILE`, and the other
  repository-scoping variables cleared. Git exports those to every hook it runs
  and a hook's children inherit them, so `--staged` from a husky `pre-commit`
  would otherwise resolve refs against the hook's repository rather than the
  scanned one.

- 7fc03e8: Add SARIF, GitLab Code Quality, markdown, and GitHub Actions output, plus a
  configurable failure gate.

  `--format console|json|sarif|gitlab|markdown|github` selects the output shape,
  `--output <path>` writes it to a file, and `--json-compact` drops the
  indentation from the JSON-based formats. SARIF results carry explicit
  `partialFingerprints`, so a GitHub code-scanning alert survives an edit near the
  finding instead of being closed and reopened. `github` is additive: it prints
  workflow annotations and appends the report to the job summary while keeping the
  readable console output.

  `--blocking none|warning|error` sets the severity that fails the run,
  independently of `--min-score`. The defaults reproduce existing behaviour
  exactly — `error` for the console report, `none` for `--json` and `--score`,
  which previously failed only on `--min-score`. Passing `--blocking` explicitly
  makes every output mode behave the same.

  `--list-rules` prints the built-in rule catalogue (add `--json` for a
  machine-readable list).

  The markdown, SARIF, and GitLab builders are exported from the public API as
  `buildMarkdownReport`, `buildSarifLog`, and `buildCodeQualityReport`, alongside
  the diff-scoping and fingerprint helpers.

  Warnings and errors about the run itself now go to stderr, so stdout stays a
  clean machine-readable stream.

### Patch Changes

- 41eaa2a: Make the markdown report's scope caption self-explanatory.

  When the scan was handed fewer files than the change touched, the caption now
  reads "5 of 9 changed files scanned" instead of "5 files in scope" — the old
  wording invited a reader to compare it against the pull request's own file count
  and read the gap as a miscount. It falls back to the previous wording when the
  caller does not know the pre-filter total, and says nothing extra when nothing
  was filtered out.

  A base given as a full commit SHA is abbreviated to seven characters. Branch
  names are printed as they were given.

- 76e5f09: Fix a monorepo's root config being silently ignored by every sub-project.

  `loadConfigWithFallback` only fell back to the root config when `loadConfig`
  threw, but `loadConfig` swallows a missing file and returns the defaults — so a
  root `nestjs-doctor.config.json` (or one passed via `--config`) was loaded and
  then dropped for each sub-project. A sub-project that ships its own config still
  takes precedence; one that ships none now inherits the root's.

  Closes #109.

## 0.5.1

### Patch Changes

- 8aa2802: Update runtime dependencies to their latest versions: ts-morph 27 → 28, citty 0.1 → 0.2, jiti → 2.7, ora → 9.4, plus patch bumps for picocolors, picomatch, and tinyglobby. No API or behaviour changes — verified against the full test suite and the CLI (`--help`, `--score`, `--json`, and a default run).

## 0.5.0

### Minor Changes

- 11bb016: Add inline rule suppression via source comments. Silence a rule for a single line or an entire file without editing the config, using `// nestjs-doctor-ignore` directives (with `disable` accepted as an alias):

  ```typescript
  const config = eval(raw); // nestjs-doctor-ignore security/no-eval

  // nestjs-doctor-ignore-next-line security/no-eval
  const config = eval(raw);

  // nestjs-doctor-ignore-file security/no-eval
  ```

  Supported directives: `nestjs-doctor-ignore` / `-line` (same line), `-next-line` (line below), and `-file` (whole file). The rule list is space- or comma-separated; omit it to suppress every rule for that scope. An optional `-- reason` trailer is ignored so the exception can be documented inline. Line-scoped directives apply to code diagnostics; schema diagnostics (which have no line) are suppressed with `-file`, in the entity source for TypeORM/MikroORM/Drizzle and directly in the `schema.prisma` file for Prisma. This implements the previously-documented-but-inert `// nestjs-doctor-ignore` convention referenced by the bundled skill.

## 0.4.33

### Patch Changes

- 7600d1c: Fix false positives in `require-primary-key` and `require-timestamps` for TypeORM entities that extend an abstract base class.

  Previously, the TypeORM extractor only inspected properties declared directly on the entity class. If a project used a shared abstract base class (e.g. `BaseEntity`) to centralise common columns like `@PrimaryGeneratedColumn`, `@CreateDateColumn`, and `@UpdateDateColumn`, every concrete entity extending that base would be flagged — even though those columns exist in the database table.

  The extractor now walks the full class hierarchy and collects inherited columns and relations from all ancestor classes. A child-class property always takes precedence over a same-named property on a parent, so overrides are handled correctly.

## 0.4.32

### Patch Changes

- 541497a: Add MikroORM schema extractor. Projects depending on `@mikro-orm/core` now
  benefit from the three `schema/*` rules and the ER diagram in the HTML
  report. Previously, MikroORM projects were detected but produced an empty
  schema graph; the extractor closes that gap with parity to the TypeORM
  extractor — entity, columns, relations including `Collection<T>` / `Ref<T>`
  type-arg resolution, `@Enum`, `@Unique`, composite `@Index`, abstract base
  class skipping, and `deleteRule` (v6) / `onDelete` (legacy) cascade
  detection.

  Closes #118.

## 0.4.31

### Patch Changes

- b046574: Add `ignoreForwardRefCycles` option to `architecture/no-circular-module-deps`. When enabled, cycles whose every consecutive edge uses `forwardRef()` are suppressed. One-sided `forwardRef` still flags. Default behavior unchanged. Closes #110.

## 0.4.30

### Patch Changes

- 5553c99: Enrich endpoint dependency graph with branch conditions, iteration context, guard-throw patterns, swagger metadata, and inline step/throw nodes

## 0.4.29

### Patch Changes

- beb2062: Add missing bad/good code examples for 10 rules in the HTML report (7 new correctness/security rules, 3 schema rules) and fix formatting in require-lifecycle-interface rule

## 0.4.28

### Patch Changes

- af2fef3: Add endpoint dependency graph to the report. Each HTTP endpoint now shows which services, repositories, and other providers it calls, including nested dependencies and call order. The new Endpoints tab is hidden until endpoint data is available and is marked as beta.

## 0.4.27

### Patch Changes

- fc0faad: Update docs to cover all five monorepo detection strategies (nest-cli.json, pnpm workspaces, npm/Yarn workspaces, Nx, standalone Lerna) and the fallback warning.

## 0.4.26

### Patch Changes

- 109b95f: Fix combined monorepo schema ORM field being overwritten by sub-projects without an ORM

## 0.4.25

### Patch Changes

- 2f121fa: Add Drizzle ORM schema extraction support and require-timestamps rule coverage for Drizzle schemas

## 0.4.24

### Patch Changes

- 4a55ef9: Add integration tests for config file exclusion, nested node_modules exclusion, and forRootAsync module resolution

## 0.4.23

### Patch Changes

- 0232a8b: Pass path aliases as function parameters instead of module-level state

## 0.4.22

### Patch Changes

- 16db4ff: Update module graph docs for cross-file import resolution

## 0.4.21

### Patch Changes

- 29c2c77: Update docs for dynamic module import resolution

## 0.4.20

### Patch Changes

- 398033a: Treat `@Resolver` and `@WebSocketGateway` as implicit `@Injectable` to prevent false positives in GraphQL and WebSocket apps.

## 0.4.19

### Patch Changes

- dd08253: Minimize published package size (904 KB → 390 KB unpacked, 200 KB → 101 KB compressed)

  - Remove source maps from published package
  - Enable minification for API and CLI bundles
  - Drop CJS build (ESM-only)
  - Embed skill templates as string constants, remove `skill/` from package
  - Lazy-load report and init code via dynamic imports (code splitting)

## 0.4.18

### Patch Changes

- 08d267d: Add schema analysis: extract entity-relationship data from Prisma schemas and TypeORM decorators, run 3 new schema rules (require-primary-key, require-timestamps, require-cascade-rule), render an interactive ER diagram in the HTML report, and surface schema diagnostics in the CLI and LSP. Includes @@id composite primary key support, self-relation classification fix, and backward-compatible RuleContext type alias.

## 0.4.17

### Patch Changes

- fe8ec20: Add VS Code Marketplace publish workflow

## 0.4.16

### Patch Changes

- 5de88e2: Fix tsdown build for LSP and VS Code extension, add VS Code Marketplace badge to README, and fix publish workflow pnpm compatibility

## 0.4.15

### Patch Changes

- 80925f8: Fix LSP build failure by suppressing tsdown inlineOnly error for intentionally bundled dependencies

## 0.4.14

### Patch Changes

- 9aa514a: Fix VS Code extension auto-publish by adding publish job to release workflow and workflow_dispatch fallback

## 0.4.13

### Patch Changes

- 69ba416: Add logo to HTML report brand bar, README, docs header, and leaderboard page

## 0.4.12

### Patch Changes

- f1a347d: Export granular scanning API (`prepareScan`, `scanFile`, `scanAllFiles`, `scanProject`, `updateFile`) for incremental LSP scanning support.

## 0.4.11

### Patch Changes

- ba201ef: Add create-rule skill, enhance Lab with code viewer layout swap and improved scripting, and update docs.

## 0.4.10

### Patch Changes

- ebca9bd: Rename `--graph` flag to `--report` and update output filename to `nestjs-doctor-report.html`. The `--graph` flag is kept as a backward-compatible alias.

## 0.4.9

### Patch Changes

- 2d50123: Add custom rules support with configurable rules directory, rule loader, and resolver

## 0.4.8

### Patch Changes

- 6b03f87: Add interactive HTML graph dashboard with findings viewer, code examples, and physics-based module graph. Include source code context lines in diagnostics. Remove prefer-interface-injection rule. Refactor graph-reporter into modular files. Update documentation.

## 0.4.7

### Patch Changes

- b24c960: Update docs and add tests for multi-agent skill installation

## 0.4.6

### Patch Changes

- c5330b3: Fix `ignore.files` config option not working when diagnostic paths are absolute

## 0.4.5

### Patch Changes

- 7147ae6: Add concrete provider-level suggestions to `no-circular-module-deps` and interactive module graph via `--graph` flag

## 0.4.4

### Patch Changes

- 18924e9: Remove `prefer-await-in-handlers` rule (async without await is valid in NestJS handlers), add framework handler exemptions (ts-rest, gRPC) to `no-async-without-await`, and reduce false positives in `no-hardcoded-secrets` for Base64 pagination cursors

## 0.4.3

### Patch Changes

- 36a3eb6: Use shared `isHttpHandler()` helper in new rules and tighten entity suffix matching to avoid false positives on types like `EntityManager`

## 0.4.2

### Patch Changes

- d53ed80: Rule audit and expansion: removed 5 noisy rules, added 5 new high-value rules

  **Removed** (high false-positive rate or too opinionated):

  - `no-god-service` — arbitrary thresholds for method/dependency counts
  - `require-feature-modules` — too opinionated for small apps
  - `no-unnecessary-async` — overlapped with `no-async-without-await`
  - `require-auth-guard` — flagged public endpoints, health checks, webhooks
  - `require-validation-pipe` — couldn't detect global ValidationPipe setup

  **Added:**

  - `no-synchronize-in-production` (security/error) — flags `synchronize: true` in TypeORM config
  - `no-service-locator` (architecture/warning) — flags `ModuleRef.get()`/`resolve()` usage
  - `no-request-scope-abuse` (performance/warning) — flags `Scope.REQUEST` usage
  - `no-raw-entity-in-response` (security/warning) — flags ORM entities returned from controllers
  - `no-fire-and-forget-async` (correctness/warning) — flags unawaited async calls in service methods

  Also removed the `thresholds` config option (`godServiceMethods`/`godServiceDeps`) and updated README examples to use `npm` instead of `pnpm`.

## 0.4.1

### Patch Changes

- cf87afb: Remove noisy rules that produced too many false positives

  - **no-god-module**: Removed — flagging modules with many providers/imports was too opinionated for most projects
  - **no-logging-in-loops**: Removed — logging inside loops is often intentional for debugging
  - **prefer-pagination**: Removed — `findMany()`/`find()` without pagination is valid in many contexts
  - **no-query-in-loop**: Removed — `await` inside loops is sometimes intentional and unavoidable

## 0.4.0

### Minor Changes

- bc5c864: Add `prefer-await-in-handlers` rule and expand default exclude patterns

  - **prefer-await-in-handlers**: New correctness rule that flags async HTTP handlers in `@Controller()` classes missing `await`. Unawaited service calls risk broken stack traces, missed exception filters, and inconsistent error handling. The existing `no-async-without-await` rule now skips controller handler methods to avoid overlap.
  - **Default excludes**: Added `mock/`, `mocks/`, `*.mock.ts`, `seeder/`, `seeders/`, `*.seed.ts`, and `*.seeder.ts` to the default exclude patterns so mock and seeder files are not scanned.

## 0.3.2

### Patch Changes

- 29e81ba: fix: reduce false positives in `no-manual-instantiation` rule for Pipes, Guards, Interceptors, and Filters

  The rule now uses two-tier suffix classification:

  - **DI-only** suffixes (`Service`, `Repository`, `Gateway`, `Resolver`) are always flagged
  - **Context-aware** suffixes (`Guard`, `Interceptor`, `Pipe`, `Filter`) are only flagged inside method/constructor bodies, and skipped when used in decorator arguments or at top-level scope

## 0.3.1

### Patch Changes

- 388c2fc: Fix false positives in correctness and security rules

  - **no-missing-guard-method, no-missing-pipe-method, no-missing-filter-catch, no-missing-interceptor-method**: Skip classes with an `extends` clause to avoid flagging classes that inherit the required method from a base class (e.g., `AuthGuard extends AuthGuard(['jwt'])`)
  - **no-hardcoded-secrets**: Tighten Base64 pattern to require at least one digit, eliminating false matches on long camelCase identifiers. Skip human-readable text (contains spaces) and dot-separated constants (e.g., `AUTH.WEAK_PASSWORD`) from name-based secret detection.

## 0.3.0

### Minor Changes

- 3a21971: Add `/nestjs-doctor` Claude Code skill. Run `npx nestjs-doctor --init` to set it up, then use `/nestjs-doctor` in Claude Code to scan and fix NestJS health issues interactively.

## 0.2.0

### Minor Changes

- ce6c95e: Add `--min-score` CLI flag for CI-friendly score threshold enforcement. Exits with code 1 if the health score is below the specified value (0-100). Also configurable via `minScore` in config file. Exit code 2 for invalid input.

## 0.1.5

### Patch Changes

- Fix apex domain by updating CNAME to nestjs.doctor for proper GitHub Pages SSL certificate provisioning

## 0.1.4

### Patch Changes

- Fix custom domain by using www.nestjs.doctor in CNAME for proper GitHub Pages redirect

## 0.1.3

### Patch Changes

- Fix nestjs.doctor website blank page by removing basePath, fixing favicon path, and adding CNAME file for custom domain

## 0.1.2

### Patch Changes

- a150d79: Improve performance with optimized scanner, better rule runner error handling, API validation, and typed error results

## 0.1.1

### Patch Changes

- 109f534: Fix CLI bin shebang missing — upgrade tsdown to v0.20 which properly supports the banner config, and update package.json entry points to match new .mjs output extensions
