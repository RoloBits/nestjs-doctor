import { Controller, Get, Param } from "@nestjs/common";
import type { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
	constructor(private readonly productsService: ProductsService) {}

	@Get()
	findAll() {
		return this.productsService.findAll();
	}

	@Get(":id")
	findOne(@Param("id") id: string) {
		return this.productsService.findOne(id);
	}
}
