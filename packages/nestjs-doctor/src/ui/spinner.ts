import yoctoSpinner from "yocto-spinner";

export const spinner = (text: string) =>
	yoctoSpinner({ handleSignals: false, text });
