import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';
import type { Clock } from './tokens';

@Injectable()
export class EdgeService {
	constructor(
		@Inject('CLOCK') private readonly clock: Clock,
		private readonly config: ConfigService,
		@Inject('SHAPE') private readonly shape: { tick(): void },
		private readonly audit: AuditService
	) {}

	stamp() {
		this.clock.now();
		this.config.get('KEY');
		this.shape.tick();
		this.audit.vanished('gone');
	}
}
