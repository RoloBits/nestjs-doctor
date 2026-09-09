import { Injectable } from "@nestjs/common";

@Injectable()
export class PrismaService {
	readonly user = {
		findUnique(id: string) {
			return { id };
		},
	};

	connect(): boolean {
		return true;
	}
}
