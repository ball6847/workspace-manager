import type { LogFields, Logger } from "../ports/logger.ts";

export class ConsoleLogger implements Logger {
	constructor(private readonly _debugEnabled: boolean = false) {}

	debug(message: string, fields?: LogFields): void {
		if (!this._debugEnabled) {
			return;
		}
		console.log(`[DEBUG] ${message}`, fields ?? "");
	}

	info(message: string, fields?: LogFields): void {
		console.log(`[INFO] ${message}`, fields ?? "");
	}

	warn(message: string, fields?: LogFields): void {
		console.warn(`[WARN] ${message}`, fields ?? "");
	}

	error(message: string, fields?: LogFields): void {
		console.error(`[ERROR] ${message}`, fields ?? "");
	}
}
