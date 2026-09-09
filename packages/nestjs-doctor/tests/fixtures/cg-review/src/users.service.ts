import { Injectable } from '@nestjs/common';
import { Audited } from './audited.decorator';

@Injectable()
export class UsersService {
	@Audited()
	findAll() {
		return [];
	}
}
