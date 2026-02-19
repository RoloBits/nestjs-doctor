declare module "picomatch" {
	interface PicomatchOptions {
		windows?: boolean;
	}

	interface Picomatch {
		isMatch(
			input: string,
			glob: string | string[],
			options?: PicomatchOptions
		): boolean;
		makeRe(glob: string, options?: PicomatchOptions): RegExp;
		(
			glob: string | string[],
			options?: PicomatchOptions
		): (input: string) => boolean;
	}

	const picomatch: Picomatch;
	export default picomatch;
}
