import { Input } from "@cliffy/prompt/input";
import { Checkbox } from "@cliffy/prompt/checkbox";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { parseConfigFile, WorkspaceConfig, WorkspaceConfigItem, writeConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
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
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function enableCommand(option: EnableCommandOption): Promise<Result<void, Error>> {
	// Handle default values
	const configFile = option.config ?? "workspace.yml";
	const workspaceRoot = option.workspaceRoot ?? ".";
	const debug = option.debug ?? false;
	const autoSync = option.yes ?? false;

	// Validate workspace directory
	const validated = await isDir(workspaceRoot);
	if (!validated.ok) {
		console.log(red("❌ Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
		return Result.error(validated.error);
	}

	// Parse config file
	const parseConfig = await parseConfigFile(configFile);
	if (!parseConfig.ok) {
		console.log(red("❌ Failed to parse config file: "), configFile, `(${parseConfig.error.message})`);
		return Result.error(parseConfig.error);
	}
	const config = parseConfig.value;

	// Toggle workspace states
	const enableResult = await toggleWorkspaceStates(config, configFile, debug);
	if (!enableResult.ok) {
		return Result.error(enableResult.error);
	}

	// Handle sync confirmation
	const syncResult = await handleSyncConfirmation(
		autoSync,
		configFile,
		workspaceRoot,
		debug,
		option.concurrency ?? 4,
	);
	if (!syncResult.ok) {
		return Result.error(syncResult.error);
	}

	return Result.ok();
}

/**
 * Toggle active states for workspaces using multi-select
 *
 * @param config Workspace configuration
 * @param configFile Path to config file
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function toggleWorkspaceStates(
	config: WorkspaceConfig,
	configFile: string,
	debug: boolean,
): Promise<Result<void, Error>> {
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
	const selectedPathsResult = await Result.wrap(
		() =>
			Checkbox.prompt({
				message: "Select workspaces to enable (use space to toggle, enter to confirm):",
				search: true,
				options,
			}),
		(error) => {
			if (error instanceof Error && error.message.includes("cancelled")) {
				return new ErrorWithCause("Operation cancelled", error);
			}
			return new ErrorWithCause("Failed to prompt for workspace selection", error as Error);
		},
	)();

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
			console.log(
				workspace.active ? green(`✅ Enabled: ${workspace.path}`) : yellow(`⏸️  Disabled: ${workspace.path}`),
			);
		}
	}

	if (!changed) {
		console.log(blue("ℹ️  No changes made"));
		return Result.ok();
	}

	// Write config back to file
	const writeResult = await writeConfigFile(config, configFile);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configFile, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	console.log(green("✅ Workspace states updated successfully"));
	return Result.ok();
}

/**
 * Handle sync confirmation and execution
 *
 * @param autoSync Whether auto-sync is enabled
 * @param configFile Path to config file
 * @param workspaceRoot Path to workspace root directory
 * @param debug Whether to show debug information
 * @param concurrency Number of concurrent operations
 * @returns Result indicating success or failure
 */
async function handleSyncConfirmation(
	autoSync: boolean,
	configFile: string,
	workspaceRoot: string,
	debug: boolean,
	concurrency: number,
): Promise<Result<void, Error>> {
	// Prompt for sync if not auto-sync
	if (!autoSync) {
		const syncResult = await promptSyncConfirmation();
		if (!syncResult.ok) {
			// User cancelled or other error, tell user to run sync manually
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}

		const shouldSync = syncResult.value;
		if (shouldSync.toLowerCase() === "n" || shouldSync.toLowerCase() === "no") {
			// User selected not to sync, early return
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}
	}

	// Sync here - either auto-sync is enabled or user confirmed sync
	const syncResult = await syncCommand({
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
 * @returns Result containing the user's response or error
 */
function promptSyncConfirmation(): Promise<Result<string, Error>> {
	return Result.wrap(
		() =>
			Input.prompt({
				message: "Do you want to sync now? (Y/n):",
				suggestions: ["Y", "n"],
				default: "Y",
			}),
		(error) => new ErrorWithCause("Failed to prompt for sync confirmation", error as Error),
	)();
}
