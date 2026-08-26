import { DynamicModule, Module, Provider } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { KeyStoreService, TokenSignerService } from "./auth.services";

const JWT_SIGNER = "JWT_SIGNER";
const JWT_KEY_STORE = "JWT_KEY_STORE";

@Module({})
export class JwtModule {
	static register(secret: string): DynamicModule {
		const providers: Provider[] = [
			{ provide: JWT_SIGNER, useValue: new TokenSignerService(secret) },
			{
				provide: JWT_KEY_STORE,
				useValue: new KeyStoreService("redis://localhost:6379"),
			},
		];
		return { module: JwtModule, providers, exports: providers };
	}

	static registerAsync(): DynamicModule {
		return {
			module: JwtModule,
			imports: [],
			providers: [
				{
					provide: JWT_SIGNER,
					inject: [AppConfigService],
					useFactory: (config: AppConfigService) =>
						new TokenSignerService(config.stripeKey),
				},
			],
			exports: [JWT_SIGNER],
		};
	}
}
