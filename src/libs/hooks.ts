import { Result } from "typescript-result";
import type { PostSyncHook } from "../types/config.ts";

export type HookExecutionResult = {
	success: boolean;
	exitCode?: number;
	stdout: string;
	stderr: string;
	duration: number;
};

export type HookContext = { root: string; path: string };

export class HookExecutor {
	constructor(private _debug: boolean = false) {
		this._debug = _debug;
	}

	async executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, Error>> {
		const startTime = Date.now();

		const substitutedCmd = this._substituteVariables(hook.cmd, context);
		const substitutedWorkDir = hook.workDir ? this._substituteVariables([hook.workDir], context)[0] : context.root;

		if (this._debug) {
			console.log(`[DEBUG] Executing hook: ${hook.description || "unnamed"}`);
			console.log(`[DEBUG] Command: ${substitutedCmd.join(" ")}`);
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
		const process = command.spawn();

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => {
				process.kill();
				reject(new Error(`Hook execution timed out after ${timeout}ms`));
			}, timeout)
		);

		const result = await Promise.race([process.output(), timeoutPromise]);

		const duration = Date.now() - startTime;
		const stdout = new TextDecoder().decode(result.stdout);
		const stderr = new TextDecoder().decode(result.stderr);

		if (this._debug) {
			console.log(`[DEBUG] Hook completed in ${duration}ms`);
			if (stdout) console.log(`[DEBUG] stdout: ${stdout}`);
			if (stderr) console.log(`[DEBUG] stderr: ${stderr}`);
		}

		const executionResult: HookExecutionResult = {
			success: result.success,
			exitCode: result.code,
			stdout,
			stderr,
			duration,
		};

		return Result.ok(executionResult);
	}

	async executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], Error>> {
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
