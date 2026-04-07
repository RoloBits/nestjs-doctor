import { Injectable } from "@nestjs/common";
import { BaseService } from "./base.service";

@Injectable()
export class ProductsService extends BaseService {
	// inherits findAll() from BaseService
	findSpecial() {
		return this.repo.findSpecial();
	}
}
