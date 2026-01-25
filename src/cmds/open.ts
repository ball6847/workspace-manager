import { blue, green, red } from "@std/fmt/colors";
import * as path from "@std/path";
import { Result } from "typescript-result";
import { ErrorWithCause } from "../libs/errors.ts";
import { isDir } from "../libs/file.ts";
import { ConfigManager, type WorkspaceConfig } from "../services/config-manager.ts";
import { InteractivePrompt } from "../services/interactive-prompt.ts";
import { WorkspaceManager } from "../services/workspace-manager.ts";

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

	// Initialize managers
	const configManager = new ConfigManager(configFile);
	const workspaceManager = new WorkspaceManager(workspaceRoot);
	const interactivePrompt = new InteractivePrompt();

	// Parse config
	const configResult = await configManager.getWorkspaceConfig(workspaceRoot);
	if (!configResult.ok) {
		return Result.error(configResult.error);
	}
	const config = configResult.value;

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
		const confirmResult = await interactivePrompt.promptForEnableAndSync(selected.path);
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
		const enableResult = configManager.enableWorkspace(selected.path, config);
		if (!enableResult.ok) {
			return enableResult;
		}

		// Write config back to file
		const writeResult = await configManager.writeConfig(config);
		if (!writeResult.ok) {
			console.log(red("❌ Failed to write config file: "), configFile, `(${writeResult.error.message})`);
			return Result.error(writeResult.error);
		}

		console.log(green(`✅ Enabled: ${selected.path}`));

		// Sync the workspace
		const checkoutResult = await workspaceManager.checkoutWorkspace(selected.url, selected.path, selected.branch);
		if (!checkoutResult.ok) {
			console.log(
				red(`❌ Failed to checkout workspace: ${selected.path}`),
				`(${checkoutResult.error.message})`,
			);
			return Result.error(checkoutResult.error);
		}

		console.log(green(`✅ Successfully checked out workspace: ${selected.path}`));

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
	const interactivePrompt = new InteractivePrompt();

	// Map to format expected by promptForWorkspaceSelectionSingle
	const workspacesForPrompt = workspaces.map((w) => ({
		path: w.path,
		url: w.url,
		branch: w.branch,
		active: w.isActive,
	}));

	const result = await interactivePrompt.promptForWorkspaceSelectionSingle(workspacesForPrompt);

	if (!result.ok || result.value === null) {
		return null;
	}

	// Find selected workspace
	const workspace = workspaces.find((w) => w.path === result.value);
	return workspace ?? null;
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
