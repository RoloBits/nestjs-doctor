import { Module, Injectable } from "@nestjs/common";

@Injectable()
export class DatabaseService {
	getClient() {
		return {};
	}
}

@Module({
	providers: [DatabaseService],
	exports: [DatabaseService],
})
export class DatabaseModule {}
