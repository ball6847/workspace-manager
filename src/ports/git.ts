import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type GitPort = {
	submoduleAdd(url: string, path: string, branch?: string): Promise<Result<void, AppError>>;
	submoduleRemove(path: string): Promise<Result<void, AppError>>;
	checkoutBranch(branch: string): Promise<Result<void, AppError>>;
	getCurrentBranch(): Promise<Result<string, AppError>>;
	pullOriginBranch(branch: string): Promise<Result<void, AppError>>;
	isRepository(): Promise<Result<boolean, AppError>>;
	isWorkingDirectoryClean(): Promise<Result<boolean, AppError>>;
	getPorcelainStatus(): Promise<Result<{ modified: number; untracked: number }, AppError>>;
	stash(message?: string): Promise<Result<void, AppError>>;
	stashPop(): Promise<Result<void, AppError>>;
	fetch(): Promise<Result<void, AppError>>;
};

export type GitPortFactory = (cwd: string) => GitPort;
