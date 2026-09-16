// Module hook that serves `.css` files and the report's `.iife.js` bundle as
// their text in a default export, the way the build resolves `?raw` imports.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW_TEXT = /\.(?:css|iife\.js)$/;

export function load(url, context, nextLoad) {
	if (!RAW_TEXT.test(url)) {
		return nextLoad(url, context);
	}
	const text = readFileSync(fileURLToPath(url), "utf-8");
	return {
		format: "module",
		shortCircuit: true,
		source: `export default ${JSON.stringify(text)};`,
	};
}
