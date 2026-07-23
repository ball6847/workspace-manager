import { green } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";

export type UpdateCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
};

export async function updateCommand(ctx: AppContext, option: UpdateCommandOption): Promise<Result<void, AppError>> {
	const result = await ctx.updateService.run({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		concurrency: option.concurrency,
	});

	if (!result.ok) {
		return Result.error(result.error);
	}

	console.log(green("🎉 All workspaces updated successfully!"));
	return Result.ok();
}
