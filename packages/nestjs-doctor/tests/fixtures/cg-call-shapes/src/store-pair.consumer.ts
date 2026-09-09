import { Injectable } from "@nestjs/common";
import type * as StoreA from "./store-a";
import type * as StoreB from "./store-b";

@Injectable()
export class StorePairConsumer {
	constructor(
		private readonly primary: StoreA.Store,
		private readonly backup: StoreB.Store
	) {}

	saveBoth(): string {
		return this.primary.save() + this.backup.save();
	}
}
