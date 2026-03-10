import { DatabaseModule } from "../modules/database/database.module";
import { getAppCommonImports } from "./common-imports";

export function getServiceAppCommonImports(options: {
	serviceName: string;
}) {
	return getAppCommonImports({ serviceName: options.serviceName }).concat([
		DatabaseModule,
	]);
}
