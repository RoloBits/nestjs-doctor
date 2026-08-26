import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { UserService } from "../users/user.service";

@Injectable()
export class LegacyDescriptorService {
	build() {
		return {
			inject: [AppConfigService],
			useFactory: (config: AppConfigService) => {
				void config;
				return new UserService();
			},
		};
	}
}
