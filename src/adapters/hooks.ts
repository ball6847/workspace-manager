import { cyan } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { PostSyncHook } from "../types/config.ts";

export class HookExecutor implements HookRunner {
	constructor(private _debug: boolean = false) {
		this._debug = _debug;
	}

	async executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, AppError>> {
		const startTime = Date.now();

		const substitutedCmd = this._substituteVariables(hook.cmd, context);
		const substitutedWorkDir = hook.workDir ? this._substituteVariables([hook.workDir], context)[0] : context.root;

		// Always log hook execution
		console.log(`[HOOK] ${cyan(substitutedCmd.join(" "))}`);

		if (this._debug) {
			console.log(`[DEBUG] Working directory: ${substitutedWorkDir}`);
		}

		const env = { ...Deno.env.toObject(), ...hook.env };
		const command = new Deno.Command(substitutedCmd[0], {
			args: substitutedCmd.slice(1),
			cwd: substitutedWorkDir,
			env,
			stdout: "piped",
			stderr: "piped",
		});

		const timeout = hook.timeout || 60000;

		// Spawn the process
		const child = command.spawn();

		// Create a timeout promise that kills the process
		const timeoutPromise = new Promise<never>((_, reject) => {
			const timer = setTimeout(() => {
				child.kill();
				reject(new Error(`Hook execution timed out after ${timeout}ms`));
			}, timeout);
			// Prevent unhandled rejection when timeout is cleared
			void Promise.resolve().then(() => clearTimeout(timer));
		});

		// Wait for process to complete OR timeout using functional error handling
		const raceResult = await Result.fromAsyncCatching(() => Promise.race([child.output(), timeoutPromise]));

		// Handle timeout case separately from other errors
		if (raceResult.error && raceResult.error.message.includes("timed out")) {
			return Result.error(new AppError(AppErrorCode.HOOK_FAILED, raceResult.error.message, { cause: raceResult.error }));
		}

		// Get the output - either from race (if successful) or from child.output() fallback
		const outputResult = raceResult.ok ? Result.ok(raceResult.value) : await Result.fromAsyncCatching(() => child.output());

		if (!outputResult.ok) {
			return Result.error(
				new AppError(AppErrorCode.HOOK_FAILED, `Hook execution failed: ${raceResult.error}`, { cause: outputResult.error }),
			);
		}

		const duration = Date.now() - startTime;
		const output = outputResult.value;
		const stdout = new TextDecoder().decode(output.stdout);
		const stderr = new TextDecoder().decode(output.stderr);

		if (this._debug) {
			console.log(`[DEBUG] Hook completed in ${duration}ms`);
			if (stdout) console.log(`[DEBUG] stdout: ${stdout}`);
			if (stderr) console.log(`[DEBUG] stderr: ${stderr}`);
		}

		const executionResult: HookExecutionResult = {
			success: output.success,
			exitCode: output.code,
			stdout,
			stderr,
			duration,
		};

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
