import { Injectable } from "@nestjs/common";
import type { LeadRepository } from "./lead.repository";
import type { FuseLogger } from "./fuse-logger";
import type { LeadsHelper } from "./leads-helper";
import type { EventEmitter2 } from "./event-emitter";

@Injectable()
export class LeadsService {
	constructor(
		private readonly logger: FuseLogger,
		private readonly leadRepository: LeadRepository,
		private readonly leadsHelper: LeadsHelper,
		private readonly eventEmitter: EventEmitter2,
	) {
		this.logger.setContext("LeadsService");
	}

	// Pattern: upsert branches to update() or create() via same-class calls
	async upsert(request: any) {
		const lead = await this.leadRepository.findById(request.id);

		if (lead) {
			return await this.update(request.id, request);
		}

		return await this.create(request);
	}

	// Same-class helper: update
	private async update(id: string, data: any) {
		this.logger.log("Updating lead");
		return this.leadRepository.update(id, data);
	}

	// Same-class helper: create — also calls another same-class helper (nested)
	private async create(data: any) {
		const lead = this.leadsHelper.parseRequestToLead(data);
		const created = await this.leadRepository.create(lead);
		this.notifyCreation(created);
		return created;
	}

	// Nested same-class helper: called by create()
	private notifyCreation(lead: any) {
		this.eventEmitter.emit("lead.created", lead);
	}
}
