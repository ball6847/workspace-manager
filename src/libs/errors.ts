import { Result } from "typescript-result";

export class ErrorWithCause extends Error {
	override cause?: Error;
	constructor(message: string, cause: Error) {
		super(message);
		this.cause = cause;
	}
}

/** One-liner wrapper for creating ErrorWithCause */
export function wrapError(context: string, cause: Error): ErrorWithCause {
	return new ErrorWithCause(context, cause);
}

/** One-liner wrapper for creating Result.error with ErrorWithCause */
export function wrapErrorResult<T = void>(context: string, cause: Error): Result<T, ErrorWithCause> {
	return Result.error(new ErrorWithCause(context, cause));
}
