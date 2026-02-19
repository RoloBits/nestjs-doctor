export class NestjsDoctorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NestjsDoctorError";
	}
}

export class ConfigurationError extends NestjsDoctorError {
	constructor(message: string) {
		super(message);
		this.name = "ConfigurationError";
	}
}

export class ScanError extends NestjsDoctorError {
	constructor(message: string) {
		super(message);
		this.name = "ScanError";
	}
}

export class ValidationError extends NestjsDoctorError {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}
