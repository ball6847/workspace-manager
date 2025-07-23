import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export async function isDir(path: string): Promise<Result<void, Error>> {
	const stat = await Result.fromAsyncCatching(() => Deno.stat(path));
	if (!stat.ok) {
		return Result.error(new ErrorWithCause(`directory is not exist: ${path}`, stat.error));
	}
	if (!stat.value.isDirectory) {
		return Result.error(new Error(`not a directory: ${path}`));
	}
	return Result.ok();
}
