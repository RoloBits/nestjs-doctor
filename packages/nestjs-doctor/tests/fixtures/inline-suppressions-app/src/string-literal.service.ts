import { Injectable } from "@nestjs/common";

// The directive on the next line sits inside a STRING literal, not a real
// comment, so it must not silence the genuine eval() below it. (Text follows
// the rule id so the token isn't swallowed by the closing quote.)
@Injectable()
export class StringLiteralService {
	run(input: string) {
		const prefix = "x // nestjs-doctor-ignore-next-line security/no-eval x";
		return eval(prefix + input);
	}
}
