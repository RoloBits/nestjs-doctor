import { type Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { MailerService } from "./mailer.service";

export const MAILER_TOKEN = "MAILER_TOKEN";

// Factory providers are the documented way to build a service whose
// constructor arguments are only known at runtime.
export const mailerProvider: Provider = {
	provide: MAILER_TOKEN,
	inject: [AppConfigService],
	useFactory: (config: AppConfigService) =>
		new MailerService(config.smtpOptions, { from: config.defaultFrom }),
};
