import { Module } from "@nestjs/common";
import { JwtModule } from "./auth/jwt.module";
import { KeyStoreService, TokenSignerService } from "./auth/auth.services";
import { AppConfigService } from "./config/app-config.service";
import { mailProviders } from "./mail/mail-dispatcher.service";
import { PaymentGateway } from "./payments/payment-gateway.service";
import {
	legacyGatewayProvider,
	paymentGatewayProvider,
} from "./payments/payments.providers";
import { AuditService } from "./legacy/audit.service";
import { LegacyHelperService } from "./legacy/legacy.helpers";
import { LegacyDescriptorService } from "./legacy/legacy.providers";
import { searchProvider, SearchIndexService } from "./search/search.providers";
import { storageProvider, LocalStorageService } from "./storage/storage.providers";
import { UserService } from "./users/user.service";

@Module({
	imports: [JwtModule.register("dev-secret"), JwtModule.registerAsync()],
	providers: [
		AppConfigService,
		UserService,
		...mailProviders,
		searchProvider,
		SearchIndexService,
		storageProvider,
		LocalStorageService,
		paymentGatewayProvider,
		legacyGatewayProvider,
		PaymentGateway,
		TokenSignerService,
		KeyStoreService,
		AuditService,
		LegacyHelperService,
		LegacyDescriptorService,
	],
})
export class AppModule {}
