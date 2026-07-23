import { red, yellow } from "@std/fmt/colors";
import { isAppError } from "./app-error.ts";

export type PresentErrorOptions = {
	debug?: boolean;
	json?: boolean;
};

export function presentCommandError(commandName: string, error: Error, options?: PresentErrorOptions): void {
	const debug = options?.debug ?? false;
	const json = options?.json ?? false;

	if (json && isAppError(error)) {
		console.log(JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2));
		return;
	}

	if (isAppError(error)) {
		console.log(red(`❌ ${commandName} failed [${error.code}]:`), error.message);
	} else {
		console.log(red(`❌ ${commandName} failed:`), error.message);
	}

	if (!debug) {
		return;
	}

	if (isAppError(error) && error.context && Object.keys(error.context).length > 0) {
		console.log(yellow("Debug context:"), JSON.stringify(error.context, null, 2));
	}

	let current: unknown = error.cause;
	let depth = 0;
	while (current instanceof Error) {
		const prefix = depth === 0 ? "Caused by: " : "Caused by: ".padStart(depth * 2 + 11);
		console.log(yellow(`${prefix}${current.message}`));
		current = current.cause;
		depth++;
	}
}
