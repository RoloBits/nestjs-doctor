import { type Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { LocalStorageService, S3StorageService } from "./storage.services";

// Method-shorthand factory with driver selection.
export const storageProvider: Provider = {
	provide: "OBJECT_STORAGE",
	inject: [AppConfigService],
	useFactory(config: AppConfigService) {
		if (config.smtpOptions.host === "s3.internal") {
			return new S3StorageService("acme-uploads");
		}
		return new LocalStorageService();
	},
};
