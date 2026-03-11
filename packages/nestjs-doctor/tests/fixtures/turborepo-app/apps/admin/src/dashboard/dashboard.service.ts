import { Injectable } from "@nestjs/common";

@Injectable()
export class DashboardService {
	getStats() {
		return { totalUsers: 100, totalOrders: 50 };
	}
}
