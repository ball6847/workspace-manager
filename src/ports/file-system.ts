import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type FileSystemPort = {
	isDir(path: string): Promise<Result<void, AppError>>;
	isDirectoryEmpty(path: string): Promise<Result<boolean, AppError>>;
	lstat(path: string): Promise<Result<{ isDirectory: boolean; isSymlink: boolean }, AppError>>;
	readLink(path: string): Promise<Result<string, AppError>>;
	createSymlink(target: string, linkPath: string): Promise<Result<void, AppError>>;
	remove(path: string): Promise<Result<void, AppError>>;
	ensureDir(path: string): Promise<Result<void, AppError>>;
};
