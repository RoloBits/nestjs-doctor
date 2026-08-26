import { type Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SearchIndexService } from "./search-index.service";

export interface VaultCredentials {
	node: string;
}

// Async factory: credentials fetched before construction.
export const searchProvider: Provider = {
	provide: "SEARCH_INDEX",
	inject: [AppConfigService],
	useFactory: async (config: AppConfigService): Promise<SearchIndexService> => {
		let creds: VaultCredentials;
		try {
			creds = await fetchCredentials(config);
		} catch {
			creds = { node: config.redisUrl };
		}
		return new SearchIndexService(creds.node);
	},
};

async function fetchCredentials(config: AppConfigService): Promise<VaultCredentials> {
	return { node: `https://${config.smtpOptions.host}:9200` };
}
