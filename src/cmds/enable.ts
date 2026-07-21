import { Checkbox, type CheckboxOption } from "@cliffy/prompt/checkbox";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import type { AppError } from "../libs/app-error.ts";
import { wrapError } from "../libs/errors.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import { InteractivePrompt } from "../services/interactive-prompt.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";
import { syncCommand } from "./sync.ts";

export type EnableCommandOption = {
	/**
	 * Path to workspace config file, default is workspace.yml
	 */
	config?: string;
	/**
	 * Path to workspace root directory, default is current directory
	 */
	workspaceRoot?: string;
	/**
	 * If true, print debug information
	 */
	debug?: boolean;
	/**
	 * Number of concurrent operations
	 */
	concurrency?: number;
	/**
	 * If true, automatically sync after enabling
	 */
	yes?: boolean;
};

/**
 * Enable a disabled workspace repository
 *
 * @param ctx Application context with injected ports
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function enableCommand(ctx: AppContext, option: EnableCommandOption): Promise<Result<void, AppError>> {
	// Discover workspace
	const discovery = ctx.createDiscovery({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
	});

	const discoverResult = await discovery.discover();

	if (!discoverResult.ok) {
		console.log(red("❌ Failed to discover workspace:"), discoverResult.error.message);
		return Result.error(discoverResult.error);
	}

	const { workspaceRoot, configPath } = discoverResult.value;
	const debug = option.debug ?? false;
	const autoSync = option.yes ?? false;

	// Validate workspace directory
	const validated = await ctx.fileSystem.isDir(workspaceRoot);
	if (!validated.ok) {
		console.log(red("❌ Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
		return Result.error(validated.error);
	}

	// Initialize ConfigManager
	const configManager = ctx.createConfigStore(configPath);

	// Parse config file
	const parseResult = await configManager.getConfig();
	if (!parseResult.ok) {
		console.log(red("❌ Failed to parse config file: "), configPath, `(${parseResult.error.message})`);
		return Result.error(parseResult.error);
	}
	const config = parseResult.value;

	// Toggle workspace states
	const enableResult = await toggleWorkspaceStates(ctx, config, configManager, debug);
	if (!enableResult.ok) {
		return Result.error(enableResult.error);
	}

	// Handle sync confirmation
	const syncResult = await handleSyncConfirmation(ctx, autoSync, configPath, workspaceRoot, debug, option.concurrency ?? 4);
	if (!syncResult.ok) {
		return Result.error(syncResult.error);
	}

	return Result.ok();
}

/**
 * Toggle active states for workspaces using multi-select
 *
 * @param ctx Application context with injected ports
 * @param config Workspace configuration
 * @param configManager ConfigStore instance
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function toggleWorkspaceStates(
	_ctx: AppContext,
	config: WorkspaceConfig,
	configManager: ConfigStore,
	debug: boolean,
): Promise<Result<void, AppError>> {
	if (config.workspaces.length === 0) {
		console.log(yellow("⚠️  No workspaces found"));
		return Result.ok();
	}

	if (debug) {
		console.log(blue(`📊 Found ${config.workspaces.length} workspaces`));
	}

	// Create checkbox options with current active state
	const options = config.workspaces.map((workspace: WorkspaceConfigItem) => ({
		name: `${workspace.path} (${workspace.url})`,
		value: workspace.path,
		checked: workspace.active,
	}));

	// Prompt user to select workspaces to enable (multi-select)
	const selectedPathsResult = await Result.wrap(() => promptForWorkspaceSelection(options), handleCheckboxError)();

	if (!selectedPathsResult.ok) {
		if (selectedPathsResult.error.message.includes("cancelled")) {
			console.log(yellow("⚠️  Operation cancelled"));
			return Result.ok();
		}
		return Result.error(selectedPathsResult.error);
	}

	const selectedPaths = selectedPathsResult.value;

	// Update active states
	let changed = false;
	for (const workspace of config.workspaces) {
		const wasActive = workspace.active;
		workspace.active = selectedPaths.includes(workspace.path);
		if (wasActive !== workspace.active) {
			changed = true;
			console.log(workspace.active ? green(`✅ Enabled: ${workspace.path}`) : yellow(`⏸️  Disabled: ${workspace.path}`));
		}
	}

	if (!changed) {
		console.log(blue("ℹ️  No changes made"));
		return Result.ok();
	}

	// Write config back to file
	const writeResult = await configManager.writeConfig(config);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configManager.configPath, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	console.log(green("✅ Workspace states updated successfully"));
	return Result.ok();
}

/**
 * Prompt user to select workspaces via checkbox
 *
 * @param options Checkbox options
 * @returns Promise that resolves to selected workspace paths
 */
function promptForWorkspaceSelection(options: Array<CheckboxOption<string>>): Promise<string[]> {
	return Checkbox.prompt({
		message: "Select workspaces to enable (use space to toggle, enter to confirm):",
		search: true,
		options,
	});
}

/**
 * Handle checkbox prompt errors
 *
 * @param error Error from checkbox prompt
 * @returns Wrapped error with context
 */
function handleCheckboxError(error: unknown): AppError {
	if (error instanceof Error && error.message.includes("cancelled")) {
		return wrapError("Operation cancelled", error);
	}
	return wrapError("Failed to prompt for workspace selection", error as Error);
}

/**
 * Handle sync confirmation and execution
 *
 * @param ctx Application context with injected ports
 * @param autoSync Whether auto-sync is enabled
 * @param configFile Path to config file
 * @param workspaceRoot Path to workspace root directory
 * @param debug Whether to show debug information
 * @param concurrency Number of concurrent operations
 * @returns Result indicating success or failure
 */
async function handleSyncConfirmation(
	ctx: AppContext,
	autoSync: boolean,
	configFile: string,
	workspaceRoot: string,
	debug: boolean,
	concurrency: number,
): Promise<Result<void, AppError>> {
	// Prompt for sync if not auto-sync
	if (!autoSync) {
		const shouldSyncResult = await promptForSync();
		if (!shouldSyncResult.ok) {
			return shouldSyncResult;
		}

		if (!shouldSyncResult.value) {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}
	}

	// Sync here - either auto-sync is enabled or user confirmed sync
	const syncResult = await syncCommand(ctx, {
		config: configFile,
		workspaceRoot,
		debug,
		concurrency,
	});

	if (!syncResult.ok) {
		console.log(red("❌ Sync failed:"), syncResult.error.message);
		return Result.error(syncResult.error);
	}

	return Result.ok();
}

/**
 * Prompt user for sync confirmation
 *
 * @returns Result with boolean indicating whether to sync
 */
async function promptForSync(): Promise<Result<boolean, AppError>> {
	const interactivePrompt = new InteractivePrompt();
	const syncResult = await interactivePrompt.promptForSyncWithInput();
	if (!syncResult.ok) {
		// User cancelled or other error
		return Result.ok(false);
	}

	const shouldSync = syncResult.value;
	if (shouldSync.toLowerCase() === "n" || shouldSync.toLowerCase() === "no") {
		return Result.ok(false);
	}

	return Result.ok(true);
}
