import { Module } from "@nestjs/common";
import { JwtModule } from "./auth/jwt.module";
import { AppConfigService } from "./config/app-config.service";
import { mailProviders } from "./mail/mail-dispatcher.service";
import {
	legacyGatewayProvider,
	paymentGatewayProvider,
} from "./payments/payments.providers";
import { AuditService } from "./legacy/audit.service";
import { LegacyHelperService } from "./legacy/legacy.helpers";
import { LegacyDescriptorService } from "./legacy/legacy.providers";
import { searchProvider } from "./search/search.providers";
import { storageProvider } from "./storage/storage.providers";
import { UserService } from "./users/user.service";

@Module({
	imports: [JwtModule.register("dev-secret"), JwtModule.registerAsync()],
	providers: [
		AppConfigService,
		UserService,
		...mailProviders,
		searchProvider,
		storageProvider,
		paymentGatewayProvider,
		legacyGatewayProvider,
		AuditService,
		LegacyHelperService,
		LegacyDescriptorService,
	],
})
export class AppModule {}
