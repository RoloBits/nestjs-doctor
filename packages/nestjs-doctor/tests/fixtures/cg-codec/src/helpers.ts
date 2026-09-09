export function normalise(value: string) {
	return value.trim();
}

export class Mailer {
	static deliver(to: string) {
		return to;
	}
}
