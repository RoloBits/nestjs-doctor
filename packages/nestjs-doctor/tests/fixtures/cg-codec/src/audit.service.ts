import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
	record(what: string) {
		return what;
	}
}
