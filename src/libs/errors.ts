import { Result } from "typescript-result";
import { AppError, AppErrorCode, type AppErrorOptions } from "./app-error.ts";

/**
 * Compatibility alias that behaves like the legacy ErrorWithCause while
 * producing a proper AppError. All new code should use AppError directly.
 */
export class ErrorWithCause extends AppError {
	constructor(message: string, cause: Error) {
		super(AppErrorCode.INTERNAL, message, { cause });
	}
}

/** One-liner wrapper for creating an internal AppError from a caught cause. */
export function wrapError(context: string, cause: Error, code: AppErrorCode = AppErrorCode.INTERNAL): AppError {
	return new AppError(code, context, { cause });
}

/** One-liner wrapper for creating Result.error with an AppError. */
export function wrapErrorResult<T = void>(context: string, cause: Error, code: AppErrorCode = AppErrorCode.INTERNAL): Result<T, AppError> {
	return Result.error(new AppError(code, context, { cause }));
}

export { AppError, AppErrorCode, type AppErrorOptions };
