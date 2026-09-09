import { Injectable } from "@nestjs/common";
import { BaseService } from "./base.service";
import { formatLabel } from "./helpers";
import { Mailer } from "./mailer";
import { PrismaService } from "./prisma.service";

@Injectable()
export class NotesService extends BaseService {
	constructor(private readonly prisma: PrismaService) {
		super();
	}

	direct(): boolean {
		return this.prisma.connect();
	}

	viaMember() {
		return this.prisma.user.findUnique("1");
	}

	callsHelper(): number {
		return this.sameClassHelper();
	}

	sameClassHelper(): number {
		return 1;
	}

	callsInherited(): string {
		return this.inherited();
	}

	overridden(): string {
		return super.overridden();
	}

	recurse(depth: number): number {
		if (depth <= 0) {
			return 0;
		}
		return this.recurse(depth - 1);
	}

	callsFree(): string {
		return formatLabel(" x ");
	}

	callsStatic(): string {
		return Mailer.send("a");
	}

	viaAlias(): boolean {
		const svc = this.prisma;
		return svc.connect();
	}
}
