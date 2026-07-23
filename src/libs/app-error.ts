/**
 * Stable application error codes used across workspace-manager.
 *
 * Keep in sync with AGENTS.md §4 (Error Handling).
 */
export const AppErrorCode = {
	CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
	CONFIG_INVALID: "CONFIG_INVALID",
	CONFIG_WRITE_FAILED: "CONFIG_WRITE_FAILED",
	NOT_A_GIT_REPO: "NOT_A_GIT_REPO",
	GIT_FAILED: "GIT_FAILED",
	CHECKOUT_FAILED: "CHECKOUT_FAILED",
	BRANCH_MISMATCH: "BRANCH_MISMATCH",
	GO_UNAVAILABLE: "GO_UNAVAILABLE",
	GO_WORK_FAILED: "GO_WORK_FAILED",
	HOOK_FAILED: "HOOK_FAILED",
	PATH_INVALID: "PATH_INVALID",
	CANCELLED: "CANCELLED",
	INVALID_INPUT: "INVALID_INPUT",
	INTERNAL: "INTERNAL",
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export type AppErrorOptions = {
	cause?: Error;
	context?: Record<string, unknown>;
};

/**
 * Sentinel application error with a stable machine code.
 *
 * All fallible application and domain code returns AppError via Result.
 */
export class AppError extends Error {
	readonly code: AppErrorCode;
	override cause?: Error;
	readonly context?: Record<string, unknown>;

	constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
		super(message);
		this.name = "AppError";
		this.code = code;
		this.cause = options.cause;
		this.context = options.context;
	}
}

/** Convenience factory for AppError. */
export function appError(code: AppErrorCode, message: string, options?: AppErrorOptions): AppError {
	return new AppError(code, message, options);
}

/** Wrap an existing Error as an AppError while preserving the original cause. */
export function wrapAppError(code: AppErrorCode, message: string, cause: Error, context?: Record<string, unknown>): AppError {
	return new AppError(code, message, { cause, context });
}

/** Type guard for AppError. */
export function isAppError(err: unknown): err is AppError {
	return err instanceof AppError;
}
