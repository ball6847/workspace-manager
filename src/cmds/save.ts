import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";

export type SaveCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export async function saveCommand(ctx: AppContext, option: SaveCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.saveService.run({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
	});

	if (!result.ok) {
		console.log(red("❌ Failed to save workspace state:"), result.error.message);
		return Result.error(result.error);
	}

	const { updatedCount, errorCount, changes, configPath } = result.value;

	if (updatedCount > 0) {
		console.log(green(`✅ Successfully updated ${updatedCount} workspace(s) in ${configPath}`));
		if (option.debug) {
			for (const change of changes) {
				console.log(blue(`📝 ${change.path}: ${change.oldBranch} → ${change.newBranch}`));
			}
		}
	} else {
		console.log(green("✅ All workspaces are already up to date"));
	}

	if (errorCount > 0) {
		console.log(yellow(`⚠️  ${errorCount} workspace(s) had errors and were skipped`));
	}

	console.log(green("🎉 Save operation completed successfully!"));
	return Result.ok();
}
