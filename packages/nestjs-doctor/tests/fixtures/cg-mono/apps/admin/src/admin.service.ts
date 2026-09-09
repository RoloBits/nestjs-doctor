import { Injectable } from '@nestjs/common';
import { SharedService } from '../../../libs/shared/src/shared.service';

@Injectable()
export class AdminService {
	constructor(private readonly shared: SharedService) {}

	list(id: string) {
		return this.shared.format(id);
	}
}
