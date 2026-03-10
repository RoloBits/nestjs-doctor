import { Controller, Get, Param } from "@nestjs/common";
import type { AdminAuthService } from "./admin-auth.service";

@Controller("admin/auth")
export class AdminAuthController {
	constructor(private readonly adminAuthService: AdminAuthService) {}

	@Get("validate/:token")
	validate(@Param("token") token: string) {
		return this.adminAuthService.validate(token);
	}
}
