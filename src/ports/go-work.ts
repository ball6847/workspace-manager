import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type GoWorkPort = {
	init(): Promise<Result<void, AppError>>;
	use(paths: string[]): Promise<Result<void, AppError>>;
	remove(paths: string[]): Promise<Result<void, AppError>>;
};

export type GoWorkPortFactory = (cwd: string) => GoWorkPort;

export type GoAvailabilityPort = {
	isAvailable(): Promise<Result<boolean, AppError>>;
};
