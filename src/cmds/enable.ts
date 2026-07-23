import { Checkbox } from "@cliffy/prompt/checkbox";
import { blue, green, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError } from "../libs/app-error.ts";
import { wrapError } from "../libs/errors.ts";
import { InteractivePrompt } from "../libs/prompts.ts";

export type EnableCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
	yes?: boolean;
};

export async function enableCommand(ctx: AppContext, option: EnableCommandOption): Promise<Result<void, AppError>> {
	const discovery = ctx.createDiscovery({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
	});

	const discoverResult = await discovery.discover();
	if (!discoverResult.ok) {
		return Result.error(discoverResult.error);
	}

	const { workspaceRoot, configPath } = discoverResult.value;
	const validated = await ctx.fileSystem.isDir(workspaceRoot);
	if (!validated.ok) {
		return Result.error(validated.error);
	}

	const configStore = ctx.createConfigStore(configPath);
	const parseResult = await configStore.getConfig();
	if (!parseResult.ok) {
		return Result.error(parseResult.error);
	}
	const config = parseResult.value;

	if (config.workspaces.length === 0) {
		console.log(yellow("⚠️  No workspaces found"));
		return Result.ok();
	}

	if (option.debug) {
		console.log(blue(`📊 Found ${config.workspaces.length} workspaces`));
	}

	const options = config.workspaces.map((workspace) => ({
		name: `${workspace.path} (${workspace.url})`,
		value: workspace.path,
		checked: workspace.active,
	}));

	const selectedPathsResult = await Result.wrap(() =>
		Checkbox.prompt({
			message: "Select workspaces to enable (use space to toggle, enter to confirm):",
			search: true,
			options,
		}), handleCheckboxError)();

	if (!selectedPathsResult.ok) {
		if (selectedPathsResult.error.message.includes("cancelled")) {
			console.log(yellow("⚠️  Operation cancelled"));
			return Result.ok();
		}
		return Result.error(selectedPathsResult.error);
	}

	const selectedPaths = selectedPathsResult.value;

	const enableResult = await ctx.enableService.enablePaths({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		paths: selectedPaths,
	});

	if (!enableResult.ok) {
		return Result.error(enableResult.error);
	}

	const report = enableResult.value;
	for (const path of report.enabledPaths) {
		console.log(green(`✅ Enabled: ${path}`));
	}
	for (const path of report.disabledPaths) {
		console.log(yellow(`⏸️  Disabled: ${path}`));
	}
	if (!report.changed) {
		console.log(blue("ℹ️  No changes made"));
	}

	const autoSync = option.yes ?? false;
	if (!autoSync) {
		const interactivePrompt = new InteractivePrompt();
		const syncResult = await interactivePrompt.promptForSyncWithInput();
		if (!syncResult.ok) {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}

		const shouldSync = syncResult.value.toLowerCase();
		if (shouldSync === "n" || shouldSync === "no") {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}
	}

	const syncResult = await ctx.syncService.run({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		concurrency: option.concurrency,
	});

	if (!syncResult.ok) {
		return Result.error(syncResult.error);
	}

	return Result.ok();
}

function handleCheckboxError(error: unknown): AppError {
	if (error instanceof Error && error.message.includes("cancelled")) {
		return wrapError("Operation cancelled", error);
	}
	return wrapError("Failed to prompt for workspace selection", error as Error);
}
