import { AuthModule } from "../auth.module";
import { HealthModule } from "../health.module";

export function getBaseImports() {
  return [AuthModule, HealthModule];
}
