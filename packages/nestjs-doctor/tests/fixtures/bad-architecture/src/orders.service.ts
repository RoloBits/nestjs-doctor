import { Injectable } from "@nestjs/common";

@Injectable()
export class OrdersService {
	constructor(private readonly usersService: any) {}

	// BAD: manual instantiation of a service
	processOrder() {
		const validator = new OrderValidatorService();
		return validator.validate();
	}

	findAll() {
		return [];
	}
}

class OrderValidatorService {
	validate() {
		return true;
	}
}
