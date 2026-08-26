import { Injectable } from "@nestjs/common";
import { UserService } from "../users/user.service";

// BAD: runtime construction inside a service method shadows the
// container-managed instance.
@Injectable()
export class AuditService {
	snapshot(): string {
		const users = new UserService();
		return users.findAll().join(",");
	}
}
