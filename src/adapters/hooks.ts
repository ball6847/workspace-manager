import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { blue, gray, yellow } from "@std/fmt/colors";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { PostSyncHook } from "../types/config.ts";

export class HookExecutor implements HookRunner {
	constructor(private readonly _debug: boolean = false) {}

	async executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, AppError>> {
		const startTime = Date.now();

		const substitutedCmd = this._substituteVariables(hook.cmd, context);
		const substitutedWorkDir = hook.workDir ? this._substituteVariables([hook.workDir], context)[0] : context.root;

		console.log(blue(`Running hook: ${substitutedCmd.join(" ")}`));

		if (this._debug) {
			console.log(gray(`  workDir: ${substitutedWorkDir}`));
		}

		const env = { ...Deno.env.toObject(), ...hook.env };
		const command = new Deno.Command(substitutedCmd[0], {
			args: substitutedCmd.slice(1),
			cwd: substitutedWorkDir,
			env,
			// Hooks inherit the terminal: interactive commands (prompts) can read stdin
			// and output streams live with colors, exactly as if run by the user.
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});

		const timeout = hook.timeout || 60000;

		// Spawn the process
		const child = command.spawn();

		// Create a timeout promise that kills the process. With inherited stdio there is
		// no child.output() fallback, so we race against child.status directly.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				child.kill();
				reject(new Error(`Hook execution timed out after ${timeout}ms`));
			}, timeout);
		});

		// Wait for process to complete OR timeout using functional error handling
		const raceResult = await Result.fromAsyncCatching(() => Promise.race([child.status, timeoutPromise]));

		// Timer is no longer needed once the race has settled (no-op if it already fired).
		if (timer !== undefined) {
			clearTimeout(timer);
		}

		// Handle timeout case separately from other errors
		if (raceResult.error && raceResult.error.message.includes("timed out")) {
			return Result.error(new AppError(AppErrorCode.HOOK_FAILED, raceResult.error.message, { cause: raceResult.error }));
		}

		if (!raceResult.ok) {
			return Result.error(
				new AppError(AppErrorCode.HOOK_FAILED, `Hook execution failed: ${raceResult.error}`, { cause: raceResult.error }),
			);
		}

		const duration = Date.now() - startTime;
		const status = raceResult.value;

		if (this._debug) {
			console.log(gray(`Hook completed in ${duration}ms`));
		}

		const executionResult: HookExecutionResult = {
			success: status.success,
			exitCode: status.code,
			duration,
		};

		if (!status.success) {
			// stderr was already streamed live to the terminal; no re-print here.
			console.log(yellow(`Hook exited with non-zero status: ${status.code}`));
		}

		return Result.ok(executionResult);
	}

	async executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], AppError>> {
		const results: HookExecutionResult[] = [];

		for (const hook of hooks) {
			const result = await this.executeHook(hook, context);
			if (!result.ok) {
				return Result.error(result.error);
			}
			results.push(result.value);
		}

		return Result.ok(results);
	}

	private _substituteVariables(values: string[], context: HookContext): string[] {
		const keys: (keyof typeof context)[] = ["root", "path"];
		return values.map((value) => {
			let result = value;
			for (const key of keys) {
				result = result.replace(new RegExp(`\\{${key}\\}`, "g"), context[key]);
			}
			return result;
		});
	}
}
