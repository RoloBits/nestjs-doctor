// nestjs-doctor-ignore-file security/no-eval

import { Injectable } from "@nestjs/common";

// `-file security/no-eval` at the top suppresses no-eval for the whole file.
// Both eval calls below must be silenced.
@Injectable()
export class SecurityFileService {
	runA(input: string) {
		return eval(input);
	}

	runB(input: string) {
		return eval(input);
	}
}
