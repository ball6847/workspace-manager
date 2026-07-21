import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { GoAvailabilityPort, GoWorkPort } from "../ports/go-work.ts";

export class GoWork implements GoWorkPort, GoAvailabilityPort {
	constructor(private cwd?: string) {}

	/**
	 * Check if Go is available by running `go version`
	 */
	static async isAvailable(): Promise<Result<boolean, AppError>> {
		const result = await Result.fromAsyncCatching(async () => {
			const command = new Deno.Command("go", {
				args: ["version"],
				stdout: "piped",
				stderr: "piped",
			});
			return await command.output();
		});

		// error means, go is not available
		if (!result.ok) {
			return Result.ok(false);
		}

		// otherwise, go is available
		return Result.ok(true);
	}

	/**
	 * Instance delegate to the static availability check.
	 */
	isAvailable(): Promise<Result<boolean, AppError>> {
		return GoWork.isAvailable();
	}

	/**
	 * Run `go work init` if go.work is not exist
	 *
	 * Note that, go will automatically detect go.work from parent directory
	 */
	async init(): Promise<Result<void, AppError>> {
		const result = await Result.fromAsyncCatching(async () => {
			const command = new Deno.Command("go", {
				args: ["work", "init"],
				stdout: "piped",
				stderr: "piped",
				cwd: this.cwd,
			});
			return await command.output();
		});
		if (!result.ok) {
			return Result.error(
				new AppError(AppErrorCode.GO_WORK_FAILED, `failed to run "go work init"`, { cause: result.error }),
			);
		}

		const stderr = new TextDecoder().decode(result.value.stderr).trim();
		if (stderr !== "" && !stderr.endsWith("go.work already exists")) {
			return Result.error(
				new AppError(AppErrorCode.GO_WORK_FAILED, `expected stderr to ends with "go.work already exists, got "${stderr}""`),
			);
		}
		return Result.ok();
	}

	/**
	 * Run `go work use path1 path2`
	 *
	 * @param paths - Array of module paths to add to the workspace
	 */
	async use(paths: string[]): Promise<Result<void, AppError>> {
		const result = await Result.fromAsyncCatching(async () => {
			const command = new Deno.Command("go", {
				args: ["work", "use", ...paths],
				stdout: "piped",
				stderr: "piped",
				cwd: this.cwd,
			});
			return await command.output();
		});

		if (!result.ok) {
			return Result.error(
				new AppError(AppErrorCode.GO_WORK_FAILED, `failed to run "go work use"`, { cause: result.error }),
			);
		}

		if (result.value.code !== 0) {
			const stderr = new TextDecoder().decode(result.value.stderr);
			return Result.error(new AppError(AppErrorCode.GO_WORK_FAILED, stderr.trim()));
		}

		return Result.ok();
	}

	/**
	 * Run `go work edit -dropuse path` for each path individually
	 *
	 * Note that, the input must match the go.work file, running this from different directory will cause unmatched module name and go will silently ignore it
	 *
	 * @param paths - Array of module paths to remove from the workspace
	 */
	async remove(paths: string[]): Promise<Result<void, AppError>> {
		// Process each path individually since go work edit -dropuse only accepts one argument
		for (const path of paths) {
			const result = await Result.fromAsyncCatching(async () => {
				const command = new Deno.Command("go", {
					args: ["work", "edit", "-dropuse", path],
					stdout: "piped",
					stderr: "piped",
					cwd: this.cwd,
				});
				return await command.output();
			});

			if (!result.ok) {
				return Result.error(
					new AppError(AppErrorCode.GO_WORK_FAILED, `failed to run "go work edit -dropuse" for path: ${path}`, { cause: result.error }),
				);
			}

			if (result.value.code !== 0) {
				const stderr = new TextDecoder().decode(result.value.stderr);
				return Result.error(new AppError(AppErrorCode.GO_WORK_FAILED, `Failed to remove path "${path}": ${stderr.trim()}`));
			}
		}

		return Result.ok();
	}
}
