import { blue, gray, green, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";
import type { HookExecutionResult } from "../ports/hook-runner.ts";
import type { SyncReport } from "../services/sync.ts";
import type { ConcurrentCommandOptions } from "../types/command-options.ts";

export type SyncCommandOption = ConcurrentCommandOptions;

export async function syncCommand(ctx: AppContext, options: SyncCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.syncService.run({
		config: options.config,
		workspaceRoot: options.workspaceRoot,
		debug: options.debug,
		concurrency: options.concurrency,
	});

	if (!result.ok) {
		return Result.error(result.error);
	}

	const report = result.value;
	presentSyncReport(report, options.debug ?? false);
	return Result.ok();
}

export function presentSyncReport(report: SyncReport, debug: boolean): void {
	console.log(blue(`📄 Config file: ${report.configPath}`));
	console.log(blue(`📁 Workspace root: ${report.workspaceRoot}`));

	if (debug) {
		console.log(blue("🐛 Debug mode enabled"));
	}

	console.log(blue(`✅ Active workspaces: ${report.activeCount}`));
	console.log(blue(`❌ Inactive workspaces: ${report.inactiveCount}`));
	console.log(blue(`⬇️  Updated: ${report.updatedCount}`));
	console.log(blue(`✓ Up-to-date: ${report.upToDateCount}`));

	if (report.goWorkspaceSetup) {
		console.log(green("✅ Go workspace setup successful"));
	}

	console.log(green("🎉 Sync complete!"));

	for (const hookResult of report.globalHookResults) {
		processGlobalHookResult(hookResult);
	}

	for (const workspaceResult of report.workspaceHookResults) {
		console.log(blue(`🔧 Workspace hooks for ${workspaceResult.path}...`));
		for (const hookResult of workspaceResult.results) {
			processHookResult(hookResult, workspaceResult.path);
		}
	}

	if (debug) {
		console.log(gray("⏱ Sync timing:"));
		for (const [path, ms] of Object.entries(report.timing.perWorkspaceMs)) {
			console.log(gray(`  ⏱ ${path}: ${ms}ms`));
		}
		console.log(gray(`  removal: ${report.timing.removalMs}ms`));
		console.log(gray(`  sync: ${report.timing.syncMs}ms`));
		console.log(gray(`  go workspace: ${report.timing.goWorkspaceMs}ms`));
		console.log(gray(`  hooks: ${report.timing.hooksMs}ms`));
		console.log(gray(`  total: ${report.timing.totalMs}ms`));
	}
}

function processHookResult(hookResult: HookExecutionResult, workspacePath: string): void {
	if (hookResult.success) {
		console.log(green(`✅ Hook completed for ${workspacePath} in ${hookResult.duration}ms`));
		return;
	}

	console.log(yellow(`⚠️  Hook failed for ${workspacePath} with exit code ${hookResult.exitCode}`));
	if (hookResult.stderr) {
		console.log(yellow(`stderr: ${hookResult.stderr}`));
	}
}

function processGlobalHookResult(hookResult: HookExecutionResult): void {
	if (hookResult.success) {
		console.log(green(`✅ Global hook completed in ${hookResult.duration}ms`));
		return;
	}

	console.log(yellow(`⚠️  Global hook failed with exit code ${hookResult.exitCode}`));
	if (hookResult.stderr) {
		console.log(yellow(`stderr: ${hookResult.stderr}`));
	}
}
