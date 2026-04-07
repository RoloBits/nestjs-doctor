import { Injectable } from "@nestjs/common";

@Injectable()
export class LeadRepository {
	findById(id: string) {
		return null;
	}

	update(id: string, data: any) {
		return data;
	}

	create(data: any) {
		return data;
	}
}
