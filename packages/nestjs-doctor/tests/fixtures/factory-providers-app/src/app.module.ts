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
import { buildGuestUser } from "./legacy/legacy.helpers";
import { legacyDescriptor } from "./legacy/legacy.providers";
import { searchProvider, SearchIndexService } from "./search/search.providers";
import { storageProvider, LocalStorageService } from "./storage/storage.providers";
import { UserService } from "./users/user.service";

void buildGuestUser;
void legacyDescriptor;

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
	],
})
export class AppModule {}
