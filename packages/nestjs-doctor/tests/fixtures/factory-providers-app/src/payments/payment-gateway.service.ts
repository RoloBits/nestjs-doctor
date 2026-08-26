import { Injectable } from "@nestjs/common";

@Injectable()
export class PaymentGateway {
	constructor(private readonly apiKey: string) {}

	charge(amount: number): string {
		return `charged ${amount} with ${this.apiKey.slice(0, 4)}`;
	}
}
