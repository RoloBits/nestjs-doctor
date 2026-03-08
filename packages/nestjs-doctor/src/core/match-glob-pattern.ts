import picomatch from "picomatch";

export const compileGlobPattern = (pattern: string): RegExp => {
	return picomatch.makeRe(pattern, { windows: false });
};
