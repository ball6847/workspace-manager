import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";

export type Confirmer = {
	confirm(message: string): Promise<Result<boolean, AppError>>;
};
