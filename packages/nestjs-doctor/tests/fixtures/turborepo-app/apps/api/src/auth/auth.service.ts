import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthService {
	login(email: string, _password: string) {
		return { token: "jwt-token", email };
	}

	validateToken(token: string) {
		return { valid: token.length > 0 };
	}
}
