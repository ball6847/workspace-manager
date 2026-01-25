import { red } from "@std/fmt/colors";
import { Result } from "typescript-result";

export interface ErrorHandler {
	onError(error: Error, commandName: string): void;
}

export class ConsoleErrorHandler implements ErrorHandler {
	onError(error: Error, commandName: string): void {
		console.log(red(`❌ ${commandName} failed:`), error.message);
	}
}

export class CommandErrorHandler {
	constructor(private readonly errorHandler: ErrorHandler) {}

	handle<T>(result: Result<T, Error>, commandName: string): T | null {
		if (!result.ok) {
			this.errorHandler.onError(result.error, commandName);
			return null;
		}
		return result.value as T | null;
	}

	handleAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
		return promise.then((result) => this.handle(result, commandName));
	}

	// Static factory methods for convenience
	static withExit<T>(result: Result<T, Error>, commandName: string): T | null {
		if (!result.ok) {
			console.log(red(`❌ ${commandName} failed:`), result.error.message);
			Deno.exit(1);
		}
		return result.value as T | null;
	}

	static withExitAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
		return promise.then((result) => this.withExit(result, commandName));
	}
}
