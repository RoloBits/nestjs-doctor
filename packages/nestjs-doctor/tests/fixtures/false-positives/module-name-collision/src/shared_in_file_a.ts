import { Module } from "@nestjs/common";

// First file processed. Defines a SharedModule that participates in a real
// cycle with AModule. Because shared_in_file_b.ts is processed AFTER and also
// declares a class named SharedModule, this definition is overwritten in
// buildModuleGraph's `modules.set(name, node)` map. The cycle SharedModule
// <-> AModule is still detected (because the surviving SharedModule also
// imports [AModule, BModule]), but the diagnostic for that cycle reports
// filePath = shared_in_file_b.ts — a file that does NOT define AModule.
@Module({ imports: [AModule, BModule] })
export class SharedModule {}

@Module({ imports: [SharedModule] })
export class AModule {}
