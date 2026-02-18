import { Injectable } from "@nestjs/common";

@Injectable()
export class ConfigService {
	// BAD: hardcoded secrets
	private apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz";
	private password = "super_secret_password_123";

	getApiKey() {
		return this.apiKey;
	}

	getDbConfig() {
		return {
			// BAD: hardcoded secret in object
			secret: "my-jwt-secret-key-that-should-be-in-env",
		};
	}
}
