import { type Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { createMailer } from "./create-mailer";

export const MAILER_TOKEN = "MAILER_TOKEN";

export const mailerProvider: Provider = {
	provide: MAILER_TOKEN,
	inject: [AppConfigService],
	useFactory: createMailer,
};
