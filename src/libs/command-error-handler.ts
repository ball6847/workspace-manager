import { red } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { AppError } from "./app-error.ts";

export interface ErrorHandler {
	onError(error: Error, commandName: string): void;
}

export class ConsoleErrorHandler implements ErrorHandler {
	onError(error: Error, commandName: string): void {
		if (error instanceof AppError) {
			console.log(red(`❌ ${commandName} failed [${error.code}]:`), error.message);
		} else {
			console.log(red(`❌ ${commandName} failed:`), error.message);
		}
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

	async handleAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
		const result = await promise;
		return this.handle(result, commandName);
	}

	// Static factory methods for convenience
	static withExit<T>(result: Result<T, Error>, commandName: string): T | null {
		if (!result.ok) {
			if (result.error instanceof AppError) {
				console.log(red(`❌ ${commandName} failed [${result.error.code}]:`), result.error.message);
			} else {
				console.log(red(`❌ ${commandName} failed:`), result.error.message);
			}
			Deno.exit(1);
		}
		return result.value as T | null;
	}

	static async withExitAsync<T>(promise: Promise<Result<T, Error>>, commandName: string): Promise<T | null> {
		const result = await promise;
		return this.withExit(result, commandName);
	}
}
