import { green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { LinkReport } from "../services/link.ts";

export type LinkCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export async function linkCommand(ctx: AppContext, options: LinkCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.linkService.run({
		config: options.config,
		workspaceRoot: options.workspaceRoot,
		debug: options.debug,
	});

	if (!result.ok) {
		if (result.error.code === AppErrorCode.LINK_VALIDATION_FAILED) {
			const violations = result.error.context?.violations as string[] | undefined;
			if (violations) {
				for (const violation of violations) {
					console.error(red(`❌ ${violation}`));
				}
			}
		}
		return Result.error(result.error);
	}

	presentLinkReport(result.value);
	return Result.ok();
}

function presentLinkReport(report: LinkReport): void {
	console.log(green(`📄 Config file: ${report.configPath}`));
	console.log(green(`📁 Workspace root: ${report.workspaceRoot}`));
	console.log(green(`✅ linked: ${report.linkedCount}, ⏭️  skipped: ${report.skippedCount}`));

	if (report.skippedWorkspaceCount > 0) {
		console.log(
			yellow(`💡 ${report.skippedWorkspaceCount} workspace(s) were not linked because the submodule was missing. Run \`sync\` first.`),
		);
	}
}
