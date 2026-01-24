import { Input, Select } from "@cliffy/prompt";
import { blue, green, red, yellow } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { parseConfigFile, type WorkspaceConfig, writeConfigFile } from "../libs/config.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
import { GitManager } from "../libs/git.ts";

export type OpenCommandOption = {
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
	 * Editor to use (overrides config and $EDITOR)
	 */
	editor?: string;
	/**
	 * Workspace path to open directly (skips interactive selection)
	 */
	workspace?: string;
};

type WorkspaceSelection = {
	path: string;
	url: string;
	branch: string;
	isActive: boolean;
	isGolang: boolean;
	directory: string;
};

/**
 * Open workspace submodule in configured editor via interactive selection
 */
export async function openCommand(option: OpenCommandOption): Promise<Result<void, Error>> {
	// Handle defaults
	const configFile = option.config ?? "workspace.yml";
	const workspaceRoot = option.workspaceRoot ?? ".";
	const debug = option.debug ?? false;

	// Parse config
	const parseConfig = await parseConfigFile(configFile);
	if (!parseConfig.ok) {
		return Result.error(parseConfig.error);
	}
	const config = parseConfig.value;

	// Build workspace selection list
	const workspaces = await buildWorkspaceList(config, workspaceRoot, debug);

	if (workspaces.length === 0) {
		return Result.error(new Error("No workspaces found in configuration"));
	}

	// Check editor - CLI option overrides config, which overrides environment
	const editor = resolveEditor(config, option.editor);
	if (!editor) {
		return Result.error(
			new Error(
				"No editor configured. Set 'editor' in workspace.yml or $EDITOR environment variable",
			),
		);
	}

	if (debug) {
		console.log(blue(`Using editor: ${editor}`));
	}

	// Determine selected workspace
	let selected: WorkspaceSelection | null = null;

	// If workspace option provided, use it directly (skip interactive selection)
	if (option.workspace) {
		const found = workspaces.find((w) => w.path === option.workspace);
		if (!found) {
			return Result.error(new Error(`Workspace not found: ${option.workspace}`));
		}
		selected = found;
	} else {
		// Present interactive selection
		selected = await presentWorkspaceSelector(workspaces);
		if (!selected) {
			// User cancelled
			return Result.ok();
		}
	}

	if (debug) {
		console.log(blue(`Selected workspace: ${selected.path}`));
	}

	// Check if workspace is disabled and handle enabling/syncing
	if (!selected.isActive) {
		const confirmResult = await promptEnableAndSync(selected.path);
		if (!confirmResult.ok) {
			// User cancelled or error
			return confirmResult;
		}

		if (!confirmResult.value) {
			// User declined to enable
			console.log(blue("💡 Run 'workspace-manager enable' to enable workspaces manually"));
			return Result.ok();
		}

		// Enable the workspace
		const enableResult = await enableWorkspace(config, configFile, selected.path, debug);
		if (!enableResult.ok) {
			return enableResult;
		}

		// Sync the workspace
		const syncResult = await syncSingleWorkspace(selected, workspaceRoot, debug);
		if (!syncResult.ok) {
			return syncResult;
		}

		// Update the selected directory to reflect the new state
		selected.isActive = true;
	}

	// Open selected workspace in editor
	return openInEditor(selected.directory, editor, debug);
}

async function buildWorkspaceList(
	config: WorkspaceConfig,
	workspaceRoot: string,
	_debug: boolean,
): Promise<WorkspaceSelection[]> {
	const result: WorkspaceSelection[] = [];

	for (const workspace of config.workspaces) {
		const workspaceDir = path.join(workspaceRoot, workspace.path);

		// Check if directory exists
		const exists = await isDir(workspaceDir);
		const dirExists = exists.ok;

		// Build display string with status indicators
		const statusParts: string[] = [];

		if (!workspace.active) {
			statusParts.push("disabled");
		}

		if (!dirExists) {
			statusParts.push("not found");
		}

		const status = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";

		result.push({
			path: workspace.path,
			url: workspace.url,
			branch: workspace.branch,
			isActive: workspace.active,
			isGolang: workspace.isGolang,
			directory: workspaceDir,
			// Store display name for selector
			// @ts-ignore - custom field
			displayName: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})${status}`,
		});
	}

	return result;
}

async function presentWorkspaceSelector(
	workspaces: WorkspaceSelection[],
): Promise<WorkspaceSelection | null> {
	// Build options for Select prompt
	const options = workspaces.map((w) => {
		const displayName = (w as WorkspaceSelection & { displayName: string }).displayName;
		return {
			name: displayName,
			value: w.path,
		};
	});

	// Add cancel option
	options.push({
		name: "Cancel",
		value: "cancel",
	});

	try {
		const selected = await Select.prompt({
			message: "Select workspace to open:",
			options: options,
			search: true, // Enable type-to-search
		});

		if (selected === "cancel") {
			return null;
		}

		// Find selected workspace
		const workspace = workspaces.find((w) => w.path === selected);
		return workspace ?? null;
	} catch {
		// User cancelled with Ctrl+C
		return null;
	}
}

/**
 * Prompt user to enable and sync a disabled workspace
 *
 * @param workspacePath Path of the workspace to enable
 * @returns Result containing boolean (true = user confirmed, false = user declined) or error
 */
async function promptEnableAndSync(workspacePath: string): Promise<Result<boolean, Error>> {
	const promptResult = await Result.wrap(
		() =>
			Input.prompt({
				message: `Workspace "${workspacePath}" is disabled. Enable and sync it first? (Y/n):`,
				suggestions: ["Y", "n"],
				default: "Y",
			}),
		(error) => new ErrorWithCause("Failed to prompt for enable confirmation", error as Error),
	)();

	return promptResult.map((response: string) => {
		return response.toLowerCase() !== "n" && response.toLowerCase() !== "no";
	});
}

/**
 * Enable a single workspace in the configuration
 *
 * @param config Workspace configuration
 * @param configFile Path to config file
 * @param workspacePath Path of workspace to enable
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function enableWorkspace(
	config: WorkspaceConfig,
	configFile: string,
	workspacePath: string,
	debug: boolean,
): Promise<Result<void, Error>> {
	// Find and enable the workspace
	const workspace = config.workspaces.find((w) => w.path === workspacePath);
	if (!workspace) {
		return Result.error(new Error(`Workspace not found: ${workspacePath}`));
	}

	if (workspace.active) {
		if (debug) {
			console.log(blue(`Workspace already enabled: ${workspacePath}`));
		}
		return Result.ok();
	}

	workspace.active = true;
	console.log(green(`✅ Enabled: ${workspacePath}`));

	// Write config back to file
	const writeResult = await writeConfigFile(config, configFile);
	if (!writeResult.ok) {
		console.log(red("❌ Failed to write config file: "), configFile, `(${writeResult.error.message})`);
		return Result.error(writeResult.error);
	}

	return Result.ok();
}

/**
 * Sync a single workspace (clone/checkout/pull)
 *
 * @param selected WorkspaceSelection object with workspace details
 * @param workspaceRoot Path to workspace root directory
 * @param debug Whether to show debug information
 * @returns Result indicating success or failure
 */
async function syncSingleWorkspace(
	selected: WorkspaceSelection,
	workspaceRoot: string,
	_debug: boolean,
): Promise<Result<void, Error>> {
	const workspacePath = selected.path;

	console.log(
		yellow(`📥 Checking out workspace: ${workspacePath} from ${selected.url} on branch ${selected.branch}`),
	);

	// Add submodule with specified branch
	const git = new GitManager(workspaceRoot);
	const addResult = await git.submoduleAdd(selected.url, workspacePath, selected.branch);
	if (!addResult.ok) {
		console.log(
			red(`❌ Failed to checkout workspace: ${workspacePath}`),
			`(${addResult.error.message})`,
		);
		return Result.error(addResult.error);
	}

	// Check out the submodule to the specified branch
	const fullSubmodulePath = path.join(workspaceRoot, workspacePath);
	const submoduleGit = new GitManager(fullSubmodulePath);
	const checkoutResult = await submoduleGit.checkoutBranch(selected.branch);
	if (!checkoutResult.ok) {
		return Result.error(
			new ErrorWithCause(
				`Failed to checkout submodule at ${workspacePath} to branch ${selected.branch}`,
				checkoutResult.error,
			),
		);
	}

	// Pull the latest changes from the specified branch
	const pullResult = await submoduleGit.pullOriginBranch(selected.branch);
	if (!pullResult.ok) {
		return Result.error(
			new ErrorWithCause(
				`Failed to pull latest changes for submodule at ${workspacePath} from branch ${selected.branch}`,
				pullResult.error,
			),
		);
	}

	console.log(green(`✅ Successfully checked out workspace: ${workspacePath}`));
	return Result.ok();
}

function resolveEditor(config: WorkspaceConfig, cliEditor?: string): string | null {
	// 0. Check CLI option first (highest priority)
	if (cliEditor && cliEditor.trim().length > 0) {
		return cliEditor;
	}

	// 1. Check global editor in config
	if (config.editor && config.editor.trim().length > 0) {
		return config.editor;
	}

	// 2. Fallback to environment variable
	const envEditor = Deno.env.get("EDITOR");
	if (envEditor && envEditor.trim().length > 0) {
		return envEditor;
	}

	// 3. Check VISUAL as secondary fallback
	const visualEditor = Deno.env.get("VISUAL");
	if (visualEditor && visualEditor.trim().length > 0) {
		return visualEditor;
	}

	return null;
}

async function openInEditor(dir: string, editor: string, debug: boolean): Promise<Result<void, Error>> {
	return await Result.fromAsyncCatching(async () => {
		// Parse editor command (support spaces in command path)
		const parts = editor.split(" ").filter((p) => p.length > 0);
		const editorCmd = parts[0];
		const args = parts.slice(1);

		if (debug) {
			console.log(blue(`Opening ${dir} with: ${editor}`));
		}

		// Spawn editor - use inherit for stdin/stdout/stderr to make it interactive
		// Use dir as working directory (cwd) instead of passing it as argument
		const command = new Deno.Command(editorCmd, {
			args: [...args],
			cwd: dir,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});

		const child = command.spawn();
		const status = await child.status;

		if (!status.success) {
			throw new Error(`Editor exited with code ${status.code}`);
		}
	}).mapError((error) => new ErrorWithCause(`Failed to open editor for ${dir}`, error));
}
