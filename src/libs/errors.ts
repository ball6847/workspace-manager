export class ErrorWithCause extends Error {
	override cause?: Error;
	constructor(message: string, cause: Error) {
		super(message);
		this.cause = cause;
	}
}
