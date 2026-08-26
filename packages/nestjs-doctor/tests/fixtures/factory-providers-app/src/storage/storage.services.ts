import { Injectable } from "@nestjs/common";

@Injectable()
export class S3StorageService {
	constructor(private readonly bucket: string) {}

	put(key: string): string {
		return `s3://${this.bucket}/${key}`;
	}
}

@Injectable()
export class LocalStorageService {
	constructor(private readonly rootDir = "/tmp/uploads") {}
}
