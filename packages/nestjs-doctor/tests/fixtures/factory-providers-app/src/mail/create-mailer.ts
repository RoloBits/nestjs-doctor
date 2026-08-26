import { AppConfigService } from "../config/app-config.service";
import { MailerService } from "./mailer.service";

export function createMailer(config: AppConfigService): MailerService {
	return new MailerService(config.smtpOptions, { from: config.defaultFrom });
}
