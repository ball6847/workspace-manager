import { Input } from "@cliffy/prompt/input";
import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { parseConfigFile, WorkspaceConfig, WorkspaceConfigItem, writeConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";

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

	// Select and enable workspace
	const enableResult = await selectAndEnableWorkspace(config, configFile, debug);
	if (!enableResult.ok) {
		return Result.error(enableResult.error);
	}

	// Handle sync confirmation
	const syncResult = await handleSyncConfirmation(autoSync);
	if (!syncResult.ok) {
		return Result.error(syncResult.error);
	}

	return Result.ok();
}

/**
 * Select and enable a workspace from disabled workspaces
 *
 * @param config Workspace configuration
 * @param configFile Path to config file
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function selectAndEnableWorkspace(
	config: WorkspaceConfig,
	configFile: string,
	debug: boolean,
): Promise<Result<void, Error>> {
	// Get disabled workspaces
	const disabledWorkspaces = config.workspaces.filter((item: WorkspaceConfigItem) => !item.active);

	if (disabledWorkspaces.length === 0) {
		console.log(yellow("⚠️  No disabled workspaces found"));
		return Result.ok();
	}

	if (debug) {
		console.log(blue(`📊 Found ${disabledWorkspaces.length} disabled workspaces`));
	}

	// Create suggestions in format "path (url)"
	const suggestions = disabledWorkspaces.map((workspace: WorkspaceConfigItem) =>
		`${workspace.path} (${workspace.url})`
	);

	// Prompt user to select workspace to enable
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

	// Enable the workspace
	config.workspaces[workspaceIndex].active = true;

	// Write config back to file
	const writeResult = await writeConfigFile(config, configFile);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configFile, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	console.log(green(`✅ Successfully enabled workspace: ${selectedPath}`));
	return Result.ok();
}

/**
 * Handle sync confirmation and execution
 *
 * @param autoSync Whether auto-sync is enabled
 * @returns Result indicating success or failure
 */
async function handleSyncConfirmation(autoSync: boolean): Promise<Result<void, Error>> {
	// Prompt for sync if not auto-sync
	if (!autoSync) {
		const syncResult = await promptSyncConfirmation();
		if (!syncResult.ok) {
			// User cancelled or other error, tell user to run sync manually
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}

		const shouldSync = syncResult.value;
		if (shouldSync.toLowerCase() !== "y" && shouldSync.toLowerCase() !== "yes") {
			// User selected not to sync, early return
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}
	}

	// Sync here - either auto-sync is enabled or user confirmed sync
	// TODO: implement this
	console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
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
				message: "Select workspace to enable:",
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
				message: "Do you want to sync now? (y/N):",
				suggestions: ["N", "y"],
				default: "N",
			}),
		(error) => new ErrorWithCause("Failed to prompt for sync confirmation", error as Error),
	)();
}
