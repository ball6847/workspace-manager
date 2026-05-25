import { blue, green, red, yellow } from "@std/fmt/colors";

/**
 * Logger type for abstracting console output
 * Enables different logging implementations for CLI vs test contexts
 */
export type Logger = {
	log(message: string): void;
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
};

/**
 * ConsoleLogger - Writes to stdout (log/info) and stderr (warn/error) with colors
 * Uses the same color patterns as existing console.log calls in the codebase
 */
export class ConsoleLogger implements Logger {
	log(message: string): void {
		console.log(message);
	}

	info(message: string): void {
		console.log(green(message));
	}

	warn(message: string): void {
		console.warn(yellow(message));
	}

	error(message: string): void {
		console.error(red(message));
	}
}

/**
 * SilentLogger - No-op implementation for tests
 * Suppresses all output, useful for unit tests where output is not needed
 */
export class SilentLogger implements Logger {
	log(_message: string): void {
		// No-op
	}

	info(_message: string): void {
		// No-op
	}

	warn(_message: string): void {
		// No-op
	}

	error(_message: string): void {
		// No-op
	}
}

/**
 * BufferLogger - Captures all output in a string array for test assertions
 * Useful for tests that need to verify specific log messages were produced
 */
export class BufferLogger implements Logger {
	private buffer: string[] = [];

	log(message: string): void {
		this.buffer.push(message);
	}

	info(message: string): void {
		this.buffer.push(message);
	}

	warn(message: string): void {
		this.buffer.push(message);
	}

	error(message: string): void {
		this.buffer.push(message);
	}

	/**
	 * Returns all captured messages in order
	 */
	getOutput(): string[] {
		return [...this.buffer];
	}

	/**
	 * Clears all captured messages
	 */
	clear(): void {
		this.buffer = [];
	}
}
