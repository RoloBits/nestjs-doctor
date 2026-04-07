import { Controller, Get } from "@nestjs/common";
import type { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
	constructor(private readonly productsService: ProductsService) {}

	// Pattern 7: inherited method from base class
	@Get()
	getAll() {
		return this.productsService.findAll();
	}
}
