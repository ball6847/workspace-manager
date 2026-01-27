import { blue, green, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { WorkspaceDiscovery } from "../libs/workspace-discovery.ts";
import { ConfigManager } from "../services/config-manager.ts";
import { InteractivePrompt } from "../services/interactive-prompt.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";
import { syncCommand } from "./sync.ts";

export type AddCommandOption = {
	/**
	 * Repository URL to add
	 */
	repo?: string;
	/**
	 * Local path for the repository (defaults to repo name)
	 */
	path?: string;
	/**
	 * Git branch to checkout (defaults to main)
	 */
	branch?: string;
	/**
	 * Whether this is a Go module
	 */
	go?: boolean;
	/**
	 * Whether to sync after adding
	 */
	sync?: boolean;
	/**
	 * Skip interactive prompts and use non-interactive mode
	 */
	yes?: boolean;
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
};

/**
 * Add a new repository to the workspace configuration
 *
 * @param option Command options
 * @returns Result indicating success or failure
 */
export async function addCommand(option: AddCommandOption): Promise<Result<void, Error>> {
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

	// Check if running in non-interactive mode
	const isNonInteractive = option.yes === true;

	if (isNonInteractive) {
		// Non-interactive mode: use provided arguments
		if (!option.repo) {
			console.log(red("❌ Repository URL is required in non-interactive mode (-y)"));
			return Result.error(new Error("Repository URL is required in non-interactive mode"));
		}

		const addResult = await addSingleWorkspace(config, configManager, option, debug);
		if (!addResult.ok) {
			return Result.error(addResult.error);
		}

		// Handle sync if requested
		if (option.sync) {
			const syncResult = await performSync(configPath, workspaceRoot, debug, option.concurrency ?? 4);
			if (!syncResult.ok) {
				return Result.error(syncResult.error);
			}
		}
	} else {
		// Interactive mode: prompt for input (may use provided repo as default)
		const interactiveResult = await runInteractiveMode(config, configManager, workspaceRoot, debug, option.concurrency ?? 4, option.repo);
		if (!interactiveResult.ok) {
			return Result.error(interactiveResult.error);
		}
	}

	return Result.ok();
}

/**
 * Add a single workspace to the configuration
 *
 * @param config Current workspace configuration
 * @param configManager ConfigManager instance
 * @param option Command options containing workspace details
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function addSingleWorkspace(config: WorkspaceConfig, configManager: ConfigManager, option: AddCommandOption, debug: boolean): Promise<Result<void, Error>> {
	const repo = option.repo!;
	const defaultPath = extractRepoName(repo);
	const workspacePath = option.path ?? defaultPath;
	const branch = option.branch ?? "main";
	const isGolang = option.go ?? false;

	if (debug) {
		console.log(blue(`📝 Adding workspace: ${workspacePath} from ${repo}`));
	}

	// Check if workspace already exists
	const existingWorkspace = config.workspaces.find((w) => w.path === workspacePath || w.url === repo);
	if (existingWorkspace) {
		console.log(yellow(`⚠️  Workspace already exists: ${existingWorkspace.path} (${existingWorkspace.url})`));
		return Result.ok();
	}

	// Create new workspace item
	const newWorkspace: WorkspaceConfigItem = {
		url: repo,
		path: workspacePath,
		branch,
		isGolang,
		active: true,
	};

	// Add to config
	config.workspaces.push(newWorkspace);

	// Write config back to file
	const writeResult = await configManager.writeConfig(config);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configManager.configPath, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	console.log(green(`✅ Successfully added workspace: ${workspacePath}`));
	return Result.ok();
}

/**
 * Run interactive mode to add multiple workspaces
 *
 * @param config Current workspace configuration
 * @param configManager ConfigManager instance
 * @param workspaceRoot Path to workspace root directory
 * @param debug Whether to show debug information
 * @param concurrency Number of concurrent operations
 * @param defaultRepo Optional default repository URL
 * @returns Result indicating success or failure
 */
async function runInteractiveMode(
	config: WorkspaceConfig,
	configManager: ConfigManager,
	workspaceRoot: string,
	debug: boolean,
	concurrency: number,
	defaultRepo?: string,
): Promise<Result<void, Error>> {
	const interactivePrompt = new InteractivePrompt();
	let hasAddedWorkspaces = false;

	while (true) {
		console.log(blue("\n📦 Adding a new workspace repository"));

		// Prompt for repository URL
		const repoResult = await interactivePrompt.promptForRepo(defaultRepo);
		if (!repoResult.ok) {
			if (repoResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(repoResult.error);
		}
		const repo = repoResult.value;

		if (!repo || repo.trim() === "") {
			console.log(yellow("⚠️  No repository URL provided"));
			continue;
		}

		// Extract default path from repo name
		const defaultPath = extractRepoName(repo);

		// Prompt for path
		const pathResult = await interactivePrompt.promptForPath(defaultPath);
		if (!pathResult.ok) {
			if (pathResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(pathResult.error);
		}
		const workspacePath = pathResult.value || defaultPath;

		// Prompt for branch
		const branchResult = await interactivePrompt.promptForBranch();
		if (!branchResult.ok) {
			if (branchResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(branchResult.error);
		}
		const branch = branchResult.value || "main";

		// Prompt for Go workspace
		const goResult = await interactivePrompt.promptForGo();
		if (!goResult.ok) {
			if (goResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(goResult.error);
		}
		const isGolang = goResult.value;

		// Check if workspace already exists
		const existingWorkspace = config.workspaces.find((w) => w.path === workspacePath || w.url === repo);
		if (existingWorkspace) {
			console.log(yellow(`⚠️  Workspace already exists: ${existingWorkspace.path} (${existingWorkspace.url})`));
			continue;
		}

		// Create new workspace item
		const newWorkspace: WorkspaceConfigItem = {
			url: repo,
			path: workspacePath,
			branch,
			isGolang,
			active: true,
		};

		// Add to config
		config.workspaces.push(newWorkspace);
		hasAddedWorkspaces = true;

		// Write config back to file
		const writeResult = await configManager.writeConfig(config);
		if (!writeResult.ok) {
			console.log(red("❌ Failed to write config file: "), configManager.configPath, `(${writeResult.error.message})`);
			return Result.error(writeResult.error);
		}

		console.log(green(`✅ Successfully added workspace: ${workspacePath}`));

		// Ask if user wants to add another workspace
		const continueResult = await interactivePrompt.promptForContinue();
		if (!continueResult.ok) {
			if (continueResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(continueResult.error);
		}

		if (!continueResult.value) {
			break;
		}
	}

	// If workspaces were added, ask about syncing
	if (hasAddedWorkspaces) {
		const syncResult = await interactivePrompt.promptForSync();
		if (!syncResult.ok) {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}

		if (syncResult.value) {
			const performSyncResult = await performSync(configManager.configPath, workspaceRoot, debug, concurrency);
			if (!performSyncResult.ok) {
				return Result.error(performSyncResult.error);
			}
		} else {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
		}
	}

	return Result.ok();
}

/**
 * Extract repository name from URL for default path
 *
 * @param repoUrl Repository URL
 * @returns Repository name
 */
function extractRepoName(repoUrl: string): string {
	// Handle various Git URL formats
	const patterns = [
		/\/([^/]+)\.git$/, // https://github.com/user/repo.git
		/\/([^/]+)$/, // https://github.com/user/repo
		/:([^/]+)\.git$/, // git@github.com:user/repo.git
		/:([^/]+)$/, // git@github.com:user/repo
	];

	for (const pattern of patterns) {
		const match = repoUrl.match(pattern);
		if (match) {
			return match[1];
		}
	}

	// Fallback: use the last part of the URL
	return repoUrl.split("/").pop()?.replace(".git", "") || "repository";
}

/**
 * Perform sync operation
 *
 * @param configPath Path to config file
 * @param workspaceRoot Path to workspace root directory
 * @param debug Whether to show debug information
 * @param concurrency Number of concurrent operations
 * @returns Result indicating success or failure
 */
async function performSync(configPath: string, workspaceRoot: string, debug: boolean, concurrency: number): Promise<Result<void, Error>> {
	const syncResult = await syncCommand({
		config: configPath,
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
