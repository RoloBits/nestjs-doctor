import { UserService } from "../users/user.service";

// BAD: plain helper constructing a registered injectable by hand.
export function buildGuestUser(): UserService {
	return new UserService();
}
