import picomatch from "picomatch";

export const compileGlobPattern = (pattern: string): RegExp => {
	return picomatch.makeRe(pattern, { windows: false });
};

export const matchGlobPattern = (
	filePath: string,
	pattern: string
): boolean => {
	return picomatch.isMatch(filePath, pattern, { windows: false });
};
