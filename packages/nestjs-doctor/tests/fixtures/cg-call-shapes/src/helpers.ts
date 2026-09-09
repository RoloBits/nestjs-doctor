import { Injectable } from "@nestjs/common";

@Injectable()
export class Label {
	render(): string {
		return "label";
	}
}

@Injectable()
export class Greeter {
	greet(): string {
		return "hi";
	}
}

export function formatLabel(value: string): string {
	return value.trim();
}

export function makeLabel(): Label {
	return new Label();
}
