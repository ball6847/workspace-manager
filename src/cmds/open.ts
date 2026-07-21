import { blue, green, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { wrapError } from "../libs/errors.ts";
import type { HookExecutionResult } from "../ports/hook-runner.ts";
import type { OpenWorkspaceInfo } from "../services/open-service.ts";
import { InteractivePrompt } from "./interactive-prompt.ts";

export type OpenCommandOption = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	editor?: string;
	workspace?: string;
};

export async function openCommand(ctx: AppContext, option: OpenCommandOption): Promise<Result<void, AppError>> {
	const listResult = await ctx.openService.listWorkspaces({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		editor: option.editor,
	});

	if (!listResult.ok) {
		return Result.error(listResult.error);
	}

	const { workspaces, editor } = listResult.value;

	if (workspaces.length === 0) {
		return Result.error(new AppError(AppErrorCode.CONFIG_INVALID, "No workspaces found in configuration"));
	}

	if (!editor) {
		return Result.error(
			new AppError(
				AppErrorCode.CONFIG_INVALID,
				"No editor configured. Set 'editor' in workspace.yml or $EDITOR environment variable",
			),
		);
	}

	if (option.debug) {
		console.log(blue(`Using editor: ${editor}`));
	}

	let selected: OpenWorkspaceInfo | null = null;

	if (option.workspace) {
		const found = workspaces.find((w) => w.path === option.workspace);
		if (!found) {
			return Result.error(new AppError(AppErrorCode.CONFIG_INVALID, `Workspace not found: ${option.workspace}`, { context: { path: option.workspace } }));
		}
		selected = found;
	} else {
		selected = await presentWorkspaceSelector(workspaces);
		if (!selected) {
			return Result.ok();
		}
	}

	if (option.debug) {
		console.log(blue(`Selected workspace: ${selected.path}`));
	}

	let enableIfDisabled = selected.isActive;

	if (!selected.isActive) {
		const interactivePrompt = new InteractivePrompt();
		const confirmResult = await interactivePrompt.promptForEnableAndSync(selected.path);
		if (!confirmResult.ok) {
			return confirmResult;
		}
		if (!confirmResult.value) {
			console.log(blue("💡 Run 'workspace-manager enable' to enable workspaces manually"));
			return Result.ok();
		}
		enableIfDisabled = true;
	}

	const prepareResult = await ctx.openService.prepareWorkspace({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		path: selected.path,
		enableIfDisabled,
		editor,
	});

	if (!prepareResult.ok) {
		return Result.error(prepareResult.error);
	}

	const prepareReport = prepareResult.value;

	for (const hookResult of prepareReport.globalHookResults) {
		processGlobalHookResult(hookResult);
	}
	for (const hookResult of prepareReport.workspaceHookResults) {
		processHookResult(hookResult, selected.path);
	}

	return openInEditor(prepareReport.directory, editor, option.debug ?? false);
}

async function presentWorkspaceSelector(workspaces: OpenWorkspaceInfo[]): Promise<OpenWorkspaceInfo | null> {
	const interactivePrompt = new InteractivePrompt();

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

	return workspaces.find((w) => w.path === result.value) ?? null;
}

async function openInEditor(dir: string, editor: string, debug: boolean): Promise<Result<void, AppError>> {
	const open = async () => {
		const parts = editor.split(" ").filter((p) => p.length > 0);
		const editorCmd = parts[0];
		const args = parts.slice(1);

		if (debug) {
			console.log(blue(`Opening ${dir} with: ${editor}`));
		}

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
	};

	return await Result.fromAsyncCatching(open).mapError((error) => wrapError(`Failed to open editor for ${dir}`, error));
}

function processHookResult(hookResult: HookExecutionResult, workspacePath: string): void {
	if (hookResult.success) {
		console.log(green(`✅ Hook completed for ${workspacePath} in ${hookResult.duration}ms`));
		return;
	}

	console.log(yellow(`⚠️  Hook failed for ${workspacePath} with exit code ${hookResult.exitCode}`));
	if (hookResult.stderr) {
		console.log(yellow(`stderr: ${hookResult.stderr}`));
	}
}

function processGlobalHookResult(hookResult: HookExecutionResult): void {
	if (hookResult.success) {
		console.log(green(`✅ Global hook completed in ${hookResult.duration}ms`));
		return;
	}

	console.log(yellow(`⚠️  Global hook failed with exit code ${hookResult.exitCode}`));
	if (hookResult.stderr) {
		console.log(yellow(`stderr: ${hookResult.stderr}`));
	}
}
