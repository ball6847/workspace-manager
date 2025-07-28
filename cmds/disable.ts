import { Input } from "@cliffy/prompt/input";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { parseConfigFile, WorkspaceConfig, WorkspaceConfigItem, writeConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
import { syncCommand } from "./sync.ts";

export type DisableCommandOption = {
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
	 * If true, automatically sync after disabling
	 */
	yes?: boolean;
};

/**
 * Disable an active workspace repository
 *
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function disableCommand(option: DisableCommandOption): Promise<Result<void, Error>> {
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

	// Select and disable workspace
	const disableResult = await selectAndDisableWorkspace(config, configFile, debug);
	if (!disableResult.ok) {
		return Result.error(disableResult.error);
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
 * Select and disable a workspace from active workspaces
 *
 * @param config Workspace configuration
 * @param configFile Path to config file
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function selectAndDisableWorkspace(
	config: WorkspaceConfig,
	configFile: string,
	debug: boolean,
): Promise<Result<void, Error>> {
	// Get active workspaces
	const activeWorkspaces = config.workspaces.filter((item: WorkspaceConfigItem) => item.active);

	if (activeWorkspaces.length === 0) {
		console.log(yellow("⚠️  No active workspaces found"));
		return Result.ok();
	}

	if (debug) {
		console.log(blue(`📊 Found ${activeWorkspaces.length} active workspaces`));
	}

	// Create suggestions in format "path (url)"
	const suggestions = activeWorkspaces.map((workspace: WorkspaceConfigItem) =>
		`${workspace.path} (${workspace.url})`
	);

	// Prompt user to select workspace to disable
	const selectedWorkspaceResult = await promptWorkspaceSelection(suggestions);
	if (!selectedWorkspaceResult.ok) {
		if (selectedWorkspaceResult.error.message.includes("cancelled")) {
			console.log(yellow("⚠️  Operation cancelled"));
			return Result.ok();
		}
		return Result.error(selectedWorkspaceResult.error);
	}

	const selectedWorkspace = selectedWorkspaceResult.value;

	// Validate selection
	if (!selectedWorkspace || selectedWorkspace.trim() === "") {
		console.log(yellow("⚠️  No workspace selected"));
		return Result.ok();
	}

	// Find the selected workspace by parsing the selection
	const selectedPath = selectedWorkspace.split(" (")[0];
	const workspaceIndex = config.workspaces.findIndex((workspace: WorkspaceConfigItem) =>
		workspace.path === selectedPath
	);

	if (workspaceIndex === -1) {
		return Result.error(new Error(`Workspace not found: ${selectedPath}`));
	}

	// Disable the workspace
	config.workspaces[workspaceIndex].active = false;

	// Write config back to file
	const writeResult = await writeConfigFile(config, configFile);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configFile, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	console.log(green(`✅ Successfully disabled workspace: ${selectedPath}`));
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
			// User cancelled or other error, early return
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
 * Prompt user to select a workspace from the provided suggestions
 *
 * @param suggestions Array of workspace suggestions in format "path (url)"
 * @returns Result containing the selected workspace string or error
 */
function promptWorkspaceSelection(suggestions: string[]): Promise<Result<string, Error>> {
	return Result.wrap(
		() =>
			Input.prompt({
				message: "Select workspace to disable:",
				suggestions,
				list: true,
				info: true,
				maxRows: 10,
			}),
		(error) => {
			if (error instanceof Error && error.message.includes("cancelled")) {
				return new ErrorWithCause("Operation cancelled", error);
			}
			return new ErrorWithCause("Failed to prompt for workspace selection", error as Error);
		},
	)();
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
