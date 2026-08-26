import { Injectable } from "@nestjs/common";
import { UserService } from "../users/user.service";

@Injectable()
export class AuditService {
	snapshot(): string {
		const users = new UserService();
		return users.findAll().join(",");
	}
}
