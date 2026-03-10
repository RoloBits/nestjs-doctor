import { DatabaseModule } from "../database.module";
import { getBaseImports } from "./base-imports";

export function getServiceCommonImports() {
  return getBaseImports().concat([DatabaseModule]);
}
