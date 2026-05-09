import { Module } from "@nestjs/common";

// Second file processed. Redefines SharedModule, winning the
// modules.set("SharedModule", ...) collision in buildModuleGraph
// (packages/nestjs-doctor/src/engine/graph/module-graph.ts:117).
// The surviving SharedModule.filePath becomes this file's path, so EVERY
// diagnostic that anchors on SharedModule (cycle[0] = "SharedModule") reports
// this filePath — even when the cycle's other member (AModule) is defined in
// shared_in_file_a.ts.
@Module({ imports: [AModule, BModule] })
export class SharedModule {}

@Module({ imports: [SharedModule] })
export class BModule {}
