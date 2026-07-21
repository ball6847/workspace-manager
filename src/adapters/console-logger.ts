import type { LogFields, Logger } from "../ports/logger.ts";

export class ConsoleLogger implements Logger {
	constructor(private readonly _debugEnabled: boolean = false) {}

	debug(message: string, fields?: LogFields): void {
		if (!this._debugEnabled) {
			return;
		}
		console.log(`[DEBUG] ${message}${formatFields(fields)}`);
	}

	info(message: string, fields?: LogFields): void {
		console.log(`[INFO] ${message}${formatFields(fields)}`);
	}

	warn(message: string, fields?: LogFields): void {
		console.warn(`[WARN] ${message}${formatFields(fields)}`);
	}

	error(message: string, fields?: LogFields): void {
		console.error(`[ERROR] ${message}${formatFields(fields)}`);
	}
}

function formatFields(fields?: LogFields): string {
	if (!fields || Object.keys(fields).length === 0) {
		return "";
	}

	const pairs = Object.entries(fields).map(([key, value]) => {
		if (typeof value === "string") {
			return `${key}=${value}`;
		}
		return `${key}=${JSON.stringify(value)}`;
	});

	return ` ${pairs.join(" ")}`;
}
