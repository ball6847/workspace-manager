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

	async lstat(path: string): Promise<Result<{ isDirectory: boolean; isSymlink: boolean }, AppError>> {
		return await Result.fromAsyncCatching(() => Deno.lstat(path)).mapError(
			(error) => new AppError(AppErrorCode.FS_FAILED, `lstat failed: ${path}`, { cause: error }),
		).map((stat) => ({
			isDirectory: stat.isDirectory,
			isSymlink: stat.isSymlink,
		}));
	}

	async readLink(path: string): Promise<Result<string, AppError>> {
		return await Result.fromAsyncCatching(() => Deno.readLink(path)).mapError(
			(error) => new AppError(AppErrorCode.FS_FAILED, `readLink failed: ${path}`, { cause: error }),
		);
	}

	async createSymlink(target: string, linkPath: string): Promise<Result<void, AppError>> {
		return await Result.fromAsyncCatching(() => Deno.symlink(target, linkPath)).mapError(
			(error) => new AppError(AppErrorCode.FS_FAILED, `createSymlink failed: ${linkPath}`, { cause: error }),
		);
	}

	async remove(path: string): Promise<Result<void, AppError>> {
		return await Result.fromAsyncCatching(() => Deno.remove(path)).mapError(
			(error) => new AppError(AppErrorCode.FS_FAILED, `remove failed: ${path}`, { cause: error }),
		);
	}

	async ensureDir(path: string): Promise<Result<void, AppError>> {
		return await Result.fromAsyncCatching(() => Deno.mkdir(path, { recursive: true })).mapError(
			(error) => new AppError(AppErrorCode.FS_FAILED, `ensureDir failed: ${path}`, { cause: error }),
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
