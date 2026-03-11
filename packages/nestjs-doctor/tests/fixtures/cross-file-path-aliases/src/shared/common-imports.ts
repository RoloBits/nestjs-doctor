import { DatabaseModule } from "@app/database.module";
import { getBaseImports } from "@shared/base-imports";

export function getServiceCommonImports() {
  return getBaseImports().concat([DatabaseModule]);
}
