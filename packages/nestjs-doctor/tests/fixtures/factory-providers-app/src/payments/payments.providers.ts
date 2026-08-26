import { type Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { PaymentGateway } from "./payment-gateway.service";

export const paymentGatewayProvider: Provider = {
	provide: "PAYMENT_GATEWAY",
	inject: [AppConfigService],
	useFactory: (config: AppConfigService) => ({
		gateway: new PaymentGateway(config.stripeKey),
		retryLimit: 3,
	}),
};

const legacyGateway = new PaymentGateway(process.env.LEGACY_KEY ?? "");

export const legacyGatewayProvider: Provider = {
	provide: "LEGACY_GATEWAY",
	useValue: legacyGateway,
};
