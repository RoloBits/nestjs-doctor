import { Controller, Get } from "@nestjs/common";
import { DepService } from "./dep.service";

@Controller("flow")
export class FlowController {
	constructor(private readonly dep: DepService) {}

	@Get("plain-if")
	plainIf(flag: boolean) {
		if (flag) {
			this.dep.ifOnly();
		}
	}

	@Get("two-arm")
	twoArm(flag: boolean) {
		if (flag) {
			this.dep.twoArmIf();
		} else {
			this.dep.twoArmElse();
		}
	}

	@Get("chain")
	chain(n: number) {
		if (n === 1) {
			this.dep.chainIf();
		} else if (n === 2) {
			this.dep.chainElseIf();
		} else {
			this.dep.chainElse();
		}
	}

	@Get("quad")
	quad(n: number) {
		if (n === 1) {
			this.dep.q1();
		} else if (n === 2) {
			this.dep.q2();
		} else if (n === 3) {
			this.dep.q3();
		} else {
			this.dep.q4();
		}
	}

	@Get("nested")
	nested(a: boolean, b: boolean) {
		if (a) {
			if (b) {
				this.dep.nested2();
			}
		}
	}

	@Get("nested-three")
	nestedThree(a: boolean, b: boolean, c: boolean) {
		if (a) {
			if (b) {
				if (c) {
					this.dep.nested3();
				}
			}
		}
	}

	@Get("switched")
	switched(n: number) {
		switch (n) {
			case 1:
				this.dep.caseA();
				break;
			case 2:
				this.dep.caseB();
				break;
			default:
				this.dep.defaultArm();
		}
	}

	@Get("ternary")
	ternary(flag: boolean) {
		return flag ? this.dep.ternTrue() : this.dep.ternFalse();
	}

	@Get("plain")
	plain() {
		this.dep.plain();
	}

	@Get("try-catch")
	tryCatch() {
		try {
			this.dep.inTry();
		} catch {
			this.dep.inCatch();
		} finally {
			this.dep.inFinally();
		}
	}

	@Get("bare-finally")
	bareFinally() {
		try {
			this.dep.bareFinallyBody();
		} finally {
			this.dep.bareFinallyTail();
		}
	}

	@Get("try-in-if")
	tryInIf(flag: boolean) {
		if (flag) {
			try {
				this.dep.tryInsideIf();
			} catch {
				this.dep.catchInsideIf();
			}
		}
	}

	@Get("for-of")
	forOf(xs: string[]) {
		for (const x of xs) {
			this.dep.forOf(x);
		}
	}

	@Get("classic-for")
	classicFor(xs: string[]) {
		for (let i = 0; i < xs.length; i++) {
			this.dep.classicFor(xs[i]);
		}
	}

	@Get("while")
	whileLoop(n: number) {
		let left = n;
		while (left > 0) {
			this.dep.whileCall();
			left -= 1;
		}
	}

	@Get("do-while")
	doWhileLoop(n: number) {
		let left = n;
		do {
			this.dep.doWhileCall();
			left -= 1;
		} while (left > 0);
	}

	@Get("mapped")
	mapped(xs: string[]) {
		return xs.map((x) => this.dep.mapped(x));
	}

	@Get("each")
	each(xs: string[]) {
		xs.forEach((x) => this.dep.eached(x));
	}

	@Get("filtered")
	filtered(xs: string[]) {
		return xs.filter((x) => this.dep.filtered(x));
	}

	@Get("all")
	async all() {
		const results = await Promise.all([this.dep.allA(), this.dep.allB()]);
		return results;
	}

	@Get("all-mapped")
	async allMapped(xs: string[]) {
		const results = await Promise.all(xs.map((x) => this.dep.allMapped(x)));
		return results;
	}

	@Get("awaited")
	async awaited() {
		const value = await this.dep.awaitedCall();
		return value;
	}

	@Get("bare")
	bare() {
		this.dep.bareCall();
	}

	@Get("returned")
	returned() {
		return this.dep.returnedCall();
	}

	@Get("cast-await")
	async castAwait() {
		const value = await (this.dep.castAwait() as Promise<number>);
		return value;
	}

	@Get("bang-await")
	async bangAwait() {
		const value = await (this.dep.bangAwait())!;
		return value;
	}

	@Get("throw-in-catch")
	throwInCatch() {
		try {
			this.dep.mayFail();
		} catch {
			throw new Error("wrapped");
		}
	}

	@Get("return-in-if")
	returnInIf(flag: boolean) {
		if (flag) {
			return this.dep.guarded();
		}
		return 0;
	}

	@Get("call-in-condition")
	callInCondition() {
		if (this.dep.checkIf()) {
			this.dep.insideIf();
		}
	}

	@Get("call-in-discriminant")
	callInDiscriminant() {
		switch (this.dep.pick()) {
			case 1:
				return 1;
			default:
				return 0;
		}
	}

	@Get("call-in-ternary-condition")
	callInTernaryCondition(a: number, b: number) {
		return this.dep.cond() ? a : b;
	}

	@Get("if-in-loop")
	ifInLoop(xs: string[], flag: boolean) {
		for (const x of xs) {
			if (flag) {
				this.dep.ifInLoop(x);
			}
		}
	}

	@Get("ternary-in-if")
	ternaryInIf(flag: boolean, other: boolean) {
		if (flag) {
			return other ? this.dep.ternInIfTrue() : this.dep.ternInIfFalse();
		}
		return 0;
	}

	@Get("fallthrough")
	fallthrough(n: number) {
		switch (n) {
			case 1:
			case 2:
				this.dep.fallThrough();
				break;
			default:
				break;
		}
	}

	@Get("nested-try")
	nestedTry() {
		try {
			try {
				this.dep.innerTry();
			} catch {
				this.dep.innerCatch();
			}
		} catch {
			this.dep.outerCatch();
		}
	}

	@Get("await-in-map")
	awaitInMap(xs: string[]) {
		return xs.map(async (x) => await this.dep.awaitedInMap(x));
	}

	@Get("unawaited-all")
	unawaitedAll() {
		return Promise.all([this.dep.unawaitedAllA()]);
	}

	@Get("for-await")
	async forAwait(xs: AsyncIterable<string>) {
		for await (const x of xs) {
			this.dep.forAwaitCall(x);
		}
	}

	@Get("same-line-ternaries")
	sameLineTernaries(a: boolean, b: boolean) {
		return a ? this.dep.tern1() : b ? this.dep.tern2() : this.dep.tern3();
	}

	@Get("braceless")
	braceless(flag: boolean) {
		if (flag) this.dep.bracelessIf();
		else this.dep.bracelessElse();
	}

	@Get("deferred")
	deferred() {
		setTimeout(() => this.dep.deferredCall(), 0);
	}

	@Get("reduced")
	reduced(xs: string[]) {
		return xs.reduce((acc, x) => acc + this.dep.reducedCall(x), 0);
	}

	@Get("short-circuit")
	shortCircuit(flag: boolean) {
		flag && this.dep.shortCircuitCall();
	}

	@Get("callback-in-if")
	callbackInIf(flag: boolean, xs: string[]) {
		if (flag) {
			return xs.map((x) => this.dep.callbackInIfCall(x));
		}
		return [];
	}
}
