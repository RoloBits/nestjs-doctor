import { Injectable } from "@nestjs/common";

@Injectable()
export class LeadsHelper {
	parseRequestToLead(data: any) {
		return data;
	}
}
