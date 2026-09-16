// Preload for running the CLI from source in a child process: jiti transpiles
// TypeScript, and the hook registered after it serves raw-text imports.
import { register } from "node:module";
import "jiti/register";

register(new URL("./raw-import-hooks.mjs", import.meta.url));
