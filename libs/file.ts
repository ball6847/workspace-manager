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

/**
 * Check if directory is empty (contains no files or only hidden files)
 * @param dirPath - Directory path to check
 * @returns Result with boolean indicating if directory is empty
 */
export async function isDirectoryEmpty(dirPath: string): Promise<Result<boolean, Error>> {
	return await Result.fromAsyncCatching(async () => {
		for await (const entry of Deno.readDir(dirPath)) {
			// Skip hidden files like .git
			if (!entry.name.startsWith(".")) {
				return false; // Found a non-hidden file, directory is not empty
			}
		}
		return true; // No non-hidden files found, directory is empty
	}).mapError((error) => new ErrorWithCause(`Failed to check if directory is empty`, error));
}
