import { Controller, Get } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";

// Injecting an ORM into a controller fires architecture/no-orm-in-controllers.
// The first controller suppresses it inline; the second is the negative control.
@Controller("suppressed")
export class SuppressedController {
	constructor(private readonly em: EntityManager) {} // nestjs-doctor-ignore architecture/no-orm-in-controllers

	@Get()
	list() {
		return this.em ? [] : [];
	}
}

@Controller("unsuppressed")
export class UnsuppressedController {
	constructor(private readonly em: EntityManager) {}

	@Get()
	list() {
		return this.em ? [] : [];
	}
}
