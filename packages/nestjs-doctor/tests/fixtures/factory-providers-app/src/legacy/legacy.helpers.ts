import { Injectable } from "@nestjs/common";
import { UserService } from "../users/user.service";

@Injectable()
export class LegacyHelperService {
	buildGuestUser(): UserService {
		return new UserService();
	}
}
