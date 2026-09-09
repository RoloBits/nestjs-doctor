import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
	order = {
		findUnique: (where: unknown) => where,
		update: (data: unknown) => data,
	};
}
