import { AuthModule } from "@app/auth.module";
import { HealthModule } from "@app/health.module";

export function getBaseImports() {
  return [AuthModule, HealthModule];
}
