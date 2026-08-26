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

// Registration-time construction: the container takes ownership of this
// exact instance, same as a decorator argument.
export const legacyGatewayProvider: Provider = {
	provide: "LEGACY_GATEWAY",
	useValue: new PaymentGateway(process.env.LEGACY_KEY ?? ""),
};
