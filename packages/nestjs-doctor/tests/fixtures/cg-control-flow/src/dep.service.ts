import { Injectable } from "@nestjs/common";

@Injectable()
export class DepService {
	ifOnly(): number {
		return 1;
	}

	twoArmIf(): number {
		return 1;
	}

	twoArmElse(): number {
		return 1;
	}

	chainIf(): number {
		return 1;
	}

	chainElseIf(): number {
		return 1;
	}

	chainElse(): number {
		return 1;
	}

	q1(): number {
		return 1;
	}

	q2(): number {
		return 1;
	}

	q3(): number {
		return 1;
	}

	q4(): number {
		return 1;
	}

	nested2(): number {
		return 1;
	}

	nested3(): number {
		return 1;
	}

	caseA(): number {
		return 1;
	}

	caseB(): number {
		return 1;
	}

	defaultArm(): number {
		return 1;
	}

	ternTrue(): number {
		return 1;
	}

	ternFalse(): number {
		return 1;
	}

	plain(): number {
		return 1;
	}

	inTry(): number {
		return 1;
	}

	inCatch(): number {
		return 1;
	}

	inFinally(): number {
		return 1;
	}

	bareFinallyBody(): number {
		return 1;
	}

	bareFinallyTail(): number {
		return 1;
	}

	tryInsideIf(): number {
		return 1;
	}

	catchInsideIf(): number {
		return 1;
	}

	forOf(value: string): number {
		return value.length;
	}

	classicFor(value: string): number {
		return value.length;
	}

	whileCall(): number {
		return 1;
	}

	doWhileCall(): number {
		return 1;
	}

	mapped(value: string): number {
		return value.length;
	}

	eached(value: string): number {
		return value.length;
	}

	filtered(value: string): boolean {
		return value.length > 0;
	}

	allA(): Promise<number> {
		return Promise.resolve(1);
	}

	allB(): Promise<number> {
		return Promise.resolve(2);
	}

	allMapped(value: string): Promise<number> {
		return Promise.resolve(value.length);
	}

	awaitedCall(): Promise<number> {
		return Promise.resolve(1);
	}

	bareCall(): number {
		return 1;
	}

	returnedCall(): Promise<number> {
		return Promise.resolve(1);
	}

	castAwait(): unknown {
		return Promise.resolve(1);
	}

	bangAwait(): Promise<number> | null {
		return Promise.resolve(1);
	}

	mayFail(): number {
		return 1;
	}

	guarded(): number {
		return 1;
	}

	checkIf(): boolean {
		return true;
	}

	insideIf(): number {
		return 1;
	}

	pick(): number {
		return 1;
	}

	cond(): boolean {
		return true;
	}

	ifInLoop(value: string): number {
		return value.length;
	}

	ternInIfTrue(): number {
		return 1;
	}

	ternInIfFalse(): number {
		return 1;
	}

	fallThrough(): number {
		return 1;
	}

	innerTry(): number {
		return 1;
	}

	innerCatch(): number {
		return 1;
	}

	outerCatch(): number {
		return 1;
	}

	awaitedInMap(value: string): Promise<number> {
		return Promise.resolve(value.length);
	}

	unawaitedAllA(): Promise<number> {
		return Promise.resolve(1);
	}

	forAwaitCall(value: string): number {
		return value.length;
	}

	tern1(): number {
		return 1;
	}

	tern2(): number {
		return 1;
	}

	tern3(): number {
		return 1;
	}

	bracelessIf(): number {
		return 1;
	}

	bracelessElse(): number {
		return 1;
	}

	deferredCall(): number {
		return 1;
	}

	reducedCall(value: string): number {
		return value.length;
	}

	shortCircuitCall(): number {
		return 1;
	}

	callbackInIfCall(value: string): number {
		return value.length;
	}
}
