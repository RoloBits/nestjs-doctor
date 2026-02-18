import { Injectable } from "@nestjs/common";

@Injectable()
export class PrismaService {
	user = {
		findMany: () => [],
		findUnique: (args: any) => null,
	};
}
