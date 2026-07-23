import type { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import type { PostSyncHook } from "../types/config.ts";

export type HookExecutionResult = {
	success: boolean;
	exitCode?: number;
	stdout: string;
	stderr: string;
	duration: number;
};

export type HookContext = { root: string; path: string };

export type HookRunner = {
	executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, AppError>>;
	executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], AppError>>;
};
