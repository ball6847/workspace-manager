import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type FileSystemPort = {
	isDir(path: string): Promise<Result<void, AppError>>;
	isDirectoryEmpty(path: string): Promise<Result<boolean, AppError>>;
};
