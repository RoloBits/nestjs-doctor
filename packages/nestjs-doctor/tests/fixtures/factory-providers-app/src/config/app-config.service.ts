import { Injectable } from "@nestjs/common";

export interface SmtpOptions {
	host: string;
	port: number;
}

@Injectable()
export class AppConfigService {
	readonly smtpOptions: SmtpOptions = {
		host: process.env.SMTP_HOST ?? "localhost",
		port: Number(process.env.SMTP_PORT ?? 587),
	};

	readonly defaultFrom = '"Acme" <no-reply@acme.dev>';
	readonly redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
	readonly stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
}
