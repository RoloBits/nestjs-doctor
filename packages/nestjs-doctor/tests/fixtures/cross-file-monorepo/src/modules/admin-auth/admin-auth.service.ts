import { Injectable } from "@nestjs/common";

@Injectable()
export class AdminAuthService {
	validate(token: string): boolean {
		return token.length > 0;
	}
}
