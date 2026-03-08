import type { DiagnoseResult } from "../../types/result.js";

export function printJsonReport(result: DiagnoseResult): void {
	console.log(JSON.stringify(result, null, 2));
}
