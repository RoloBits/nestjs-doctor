import { AppConfigService } from "../config/app-config.service";
import { UserService } from "../users/user.service";

// BAD: resembles a provider but carries no `provide` key, so nothing ever
// hands it to Nest — the construction is an ordinary bypass.
export const legacyDescriptor = {
	inject: [AppConfigService],
	useFactory: (config: AppConfigService) => {
		void config;
		return new UserService();
	},
};
