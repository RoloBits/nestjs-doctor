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

// Registered as a provider elsewhere; instantiating it by hand bypasses DI.
@Injectable()
class OrderValidatorService {
	validate() {
		return true;
	}
}
