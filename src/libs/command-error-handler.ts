import { Result } from "typescript-result";
import { presentCommandError, type PresentErrorOptions } from "./error-formatter.ts";

export interface ErrorHandler {
	onError(error: Error, commandName: string, options?: PresentErrorOptions): void;
}

export class ConsoleErrorHandler implements ErrorHandler {
	onError(error: Error, commandName: string, options?: PresentErrorOptions): void {
		presentCommandError(commandName, error, options);
	}
}

export class CommandErrorHandler {
	constructor(private readonly errorHandler: ErrorHandler) {}

	handle<T>(result: Result<T, Error>, commandName: string, options?: PresentErrorOptions): T | null {
		if (!result.ok) {
			this.errorHandler.onError(result.error, commandName, options);
			return null;
		}
		return result.value as T | null;
	}

	async handleAsync<T>(
		promise: Promise<Result<T, Error>>,
		commandName: string,
		options?: PresentErrorOptions,
	): Promise<T | null> {
		const result = await promise;
		return this.handle(result, commandName, options);
	}

	// Static factory methods for convenience
	static withExit<T>(result: Result<T, Error>, commandName: string, options?: PresentErrorOptions): T | null {
		if (!result.ok) {
			presentCommandError(commandName, result.error, options);
			Deno.exit(1);
		}
		return result.value as T | null;
	}

	static async withExitAsync<T>(
		promise: Promise<Result<T, Error>>,
		commandName: string,
		options?: PresentErrorOptions,
	): Promise<T | null> {
		const result = await promise;
		return this.withExit(result, commandName, options);
	}
}
