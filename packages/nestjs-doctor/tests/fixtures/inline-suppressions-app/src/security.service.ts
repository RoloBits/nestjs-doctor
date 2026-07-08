import { Injectable } from "@nestjs/common";

// Every method runs `eval` (fires security/no-eval). Each exercises a different
// directive FORM. Cases A-G must be suppressed; H, I, J must still fire.
@Injectable()
export class SecurityService {
	// CASE A - same-line bare `ignore` (no scope suffix)
	runA(input: string) {
		return eval(input); // nestjs-doctor-ignore security/no-eval
	}

	// CASE B - same-line `-line` with the `disable` alias
	runB(input: string) {
		return eval(input); // nestjs-doctor-disable-line security/no-eval
	}

	// CASE C - `-next-line` (directive above, code below)
	runC(input: string) {
		// nestjs-doctor-ignore-next-line security/no-eval
		return eval(input);
	}

	// CASE D - block comment
	runD(input: string) {
		return eval(input); /* nestjs-doctor-ignore-line security/no-eval */
	}

	// CASE E - `-- reason` trailer is ignored
	runE(input: string) {
		return eval(input); // nestjs-doctor-ignore-line security/no-eval -- legacy sandbox, tracked in JIRA-123
	}

	// CASE F - comma + space separated rule list
	runF(input: string) {
		return eval(input); // nestjs-doctor-ignore-line security/no-eval, architecture/no-orm-in-controllers
	}

	// CASE G - bare directive (no rules) suppresses every rule on the line
	runG(input: string) {
		return eval(input); // nestjs-doctor-disable-line
	}

	// NEGATIVE H - no directive -> must still fire
	runH(input: string) {
		return eval(input);
	}

	// NEGATIVE I - misspelled suffix `-lines` -> must NOT suppress
	runI(input: string) {
		return eval(input); // nestjs-doctor-disable-lines security/no-eval
	}

	// NEGATIVE J - directive names a DIFFERENT rule -> no-eval must still fire
	runJ(input: string) {
		return eval(input); // nestjs-doctor-ignore-line architecture/no-orm-in-controllers
	}
}
