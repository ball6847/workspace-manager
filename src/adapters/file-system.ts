import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { FileSystemPort } from "../ports/file-system.ts";

export class DenoFileSystem implements FileSystemPort {
	async isDir(path: string): Promise<Result<void, AppError>> {
		const stat = await Result.fromAsyncCatching(() => Deno.stat(path));
		if (!stat.ok) {
			return Result.error(
				new AppError(AppErrorCode.PATH_INVALID, `directory is not exist: ${path}`, { cause: stat.error }),
			);
		}
		if (!stat.value.isDirectory) {
			return Result.error(new AppError(AppErrorCode.PATH_INVALID, `not a directory: ${path}`));
		}
		return Result.ok();
	}

	/**
	 * Check if directory is empty (contains no files or only hidden files)
	 * @param dirPath - Directory path to check
	 * @returns Result with boolean indicating if directory is empty
	 */
	async isDirectoryEmpty(dirPath: string): Promise<Result<boolean, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			for await (const entry of Deno.readDir(dirPath)) {
				// Skip hidden files like .git
				if (!entry.name.startsWith(".")) {
					return false; // Found a non-hidden file, directory is not empty
				}
			}
			return true; // No non-hidden files found, directory is empty
		}).mapError(
			(error) => new AppError(AppErrorCode.INTERNAL, `Failed to check if directory is empty`, { cause: error }),
		);
	}
}

const defaultFileSystem = new DenoFileSystem();

export function isDir(path: string): Promise<Result<void, AppError>> {
	return defaultFileSystem.isDir(path);
}

export function isDirectoryEmpty(dirPath: string): Promise<Result<boolean, AppError>> {
	return defaultFileSystem.isDirectoryEmpty(dirPath);
}
