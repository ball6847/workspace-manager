import { green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { UnlinkReport } from "../services/unlink.ts";

export type UnlinkCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export async function unlinkCommand(ctx: AppContext, options: UnlinkCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.unlinkService.run({
		config: options.config,
		workspaceRoot: options.workspaceRoot,
		debug: options.debug,
	});

	if (!result.ok) {
		if (result.error.code === AppErrorCode.CONFIG_INVALID) {
			const issues = result.error.context?.issues as string[] | undefined;
			if (issues) {
				for (const issue of issues) {
					console.error(red(`❌ ${issue}`));
				}
			}
		}
		return Result.error(result.error);
	}

	presentUnlinkReport(result.value);
	return Result.ok();
}

function presentUnlinkReport(report: UnlinkReport): void {
	console.log(green(`📄 Config file: ${report.configPath}`));
	console.log(green(`📁 Workspace root: ${report.workspaceRoot}`));
	console.log(green(`✅ unlinked: ${report.unlinkedCount}, ⏭️  skipped: ${report.skippedCount}`));

	if (report.warnedCount > 0) {
		console.log(
			yellow(`⚠️  ${report.warnedCount} destination(s) were not symlinks and were left untouched.`),
		);
	}

	if (report.skippedWorkspaceCount > 0) {
		console.log(
			yellow(`💡 ${report.skippedWorkspaceCount} workspace(s) were not processed because the submodule was missing.`),
		);
	}
}
