import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { isDir } from "../libs/file.ts";
import { GitManager } from "../libs/git.ts";
import { WorkspaceDiscovery } from "../libs/workspace-discovery.ts";
import { ConfigManager } from "../services/config-manager.ts";

export type SaveCommandOption = {
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
};

/**
 * Save current workspace state by updating workspace.yml with current tracking branches
 * This is the opposite of sync/update - trusting the environment state over configuration
 *
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function saveCommand(option: SaveCommandOption): Promise<Result<void, Error>> {
	// Discover workspace
	const discovery = new WorkspaceDiscovery({
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

	// Initialize ConfigManager
	const configManager = new ConfigManager(configPath);

	// Parse config file
	const parseResult = await configManager.getConfig();
	if (!parseResult.ok) {
		console.log(red("❌ Failed to parse config file: "), configPath, `(${parseResult.error.message})`);
		return Result.error(parseResult.error);
	}
	const config = parseResult.value;

	if (debug) {
		console.log(blue("🔍 Scanning active workspaces for current branches..."));
	}

	// Get active workspaces
	const activeWorkspaces = config.workspaces.filter((item) => item.active);

	if (activeWorkspaces.length === 0) {
		console.log(yellow("⚠️  No active workspaces found"));
		return Result.ok();
	}

	let updatedCount = 0;
	let errorCount = 0;

	// Iterate through active workspaces and update their branch information
	for (const workspace of activeWorkspaces) {
		const workspacePath = path.join(workspaceRoot, workspace.path);

		// Check if workspace directory exists
		const dirExists = await isDir(workspacePath);
		if (!dirExists.ok) {
			console.log(yellow(`⚠️  Workspace directory not found: ${workspace.path}`));
			errorCount++;
			continue;
		}

		const git = new GitManager(workspacePath);

		// Check if it's a git repository
		const isRepo = await git.isRepository();
		if (!isRepo.ok || !isRepo.value) {
			console.log(yellow(`⚠️  Not a git repository: ${workspace.path}`));
			errorCount++;
			continue;
		}

		// Get current branch
		const currentBranch = await git.getCurrentBranch();
		if (!currentBranch.ok) {
			console.log(
				red(`❌ Failed to get current branch for ${workspace.path}: ${currentBranch.error.message}`),
			);
			errorCount++;
			continue;
		}

		const newBranch = currentBranch.value;

		// Check if branch has changed
		if (workspace.branch !== newBranch) {
			if (debug) {
				console.log(
					blue(`📝 Updating ${workspace.path}: ${workspace.branch} → ${newBranch}`),
				);
			}
			workspace.branch = newBranch;
			updatedCount++;
		} else {
			if (debug) {
				console.log(blue(`✓ ${workspace.path}: ${workspace.branch} (no change)`));
			}
		}
	}

	// Write updated config back to file if there were changes
	if (updatedCount > 0) {
		const writeResult = await configManager.writeConfig(config);
		if (!writeResult.ok) {
			console.log(red("❌ Failed to write config file: "), configPath, `(${writeResult.error.message})`);
			return Result.error(writeResult.error);
		}

		console.log(green(`✅ Successfully updated ${updatedCount} workspace(s) in ${configPath}`));
	} else {
		console.log(green("✅ All workspaces are already up to date"));
	}

	if (errorCount > 0) {
		console.log(yellow(`⚠️  ${errorCount} workspace(s) had errors and were skipped`));
	}

	console.log(green("🎉 Save operation completed successfully!"));
	return Result.ok();
}
