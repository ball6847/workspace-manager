import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import { Result } from "typescript-result";
import type { AppError } from "../libs/app-error.ts";
import { wrapError } from "../libs/errors.ts";

export type PromptMessages = {
	repo: string;
	path: string;
	branch: string;
	branchSuggestions: string[];
	go: string;
	continue: string;
	sync: string;
	workspaceSelection: string;
	workspaceOpen: string;
	cancel: string;
	enableAndSync: (workspacePath: string) => string;
};

export const defaultPromptMessages: PromptMessages = {
	repo: "Repository URL:",
	path: "Local path:",
	branch: "Branch:",
	branchSuggestions: ["main", "master", "develop", "staging"],
	go: "Is this a Go module?",
	continue: "Do you want to add another workspace?",
	sync: "Do you want to sync now?",
	workspaceSelection: "Select workspaces to enable (use space to toggle, enter to confirm):",
	workspaceOpen: "Select workspace to open:",
	cancel: "Cancel",
	enableAndSync: (workspacePath: string) => `Workspace "${workspacePath}" is disabled. Enable and sync it first?`,
};

export class InteractivePrompt {
	constructor(private readonly messages: PromptMessages = defaultPromptMessages) {}

	private _handleError(error: unknown, context: string): AppError {
		if (error instanceof Error && error.message.includes("cancelled")) {
			return wrapError("Operation cancelled", error);
		}
		return wrapError(context, error as Error);
	}

	promptForRepo(defaultRepo?: string): Promise<Result<string, AppError>> {
		return Result.wrap(
			() =>
				Input.prompt({
					message: this.messages.repo,
					default: defaultRepo,
					validate: (value) => {
						if (!value || value.trim() === "") {
							return "Repository URL is required";
						}
						return true;
					},
				}),
			(error) => this._handleError(error, "Failed to prompt for repository URL"),
		)();
	}

	promptForPath(defaultPath: string): Promise<Result<string, AppError>> {
		return Result.wrap(
			() =>
				Input.prompt({
					message: this.messages.path,
					default: defaultPath,
				}),
			(error) => this._handleError(error, "Failed to prompt for path"),
		)();
	}

	promptForBranch(): Promise<Result<string, AppError>> {
		return Result.wrap(
			() =>
				Input.prompt({
					message: this.messages.branch,
					default: "main",
					suggestions: this.messages.branchSuggestions,
				}),
			(error) => this._handleError(error, "Failed to prompt for branch"),
		)();
	}

	promptForGo(): Promise<Result<boolean, AppError>> {
		return Result.wrap(
			() =>
				Confirm.prompt({
					message: this.messages.go,
					default: false,
				}),
			(error) => this._handleError(error, "Failed to prompt for Go workspace setting"),
		)();
	}

	promptForContinue(): Promise<Result<boolean, AppError>> {
		return Result.wrap(
			() =>
				Confirm.prompt({
					message: this.messages.continue,
					default: false,
				}),
			(error) => this._handleError(error, "Failed to prompt for continue"),
		)();
	}

	promptForSync(): Promise<Result<boolean, AppError>> {
		return Result.wrap(
			() =>
				Confirm.prompt({
					message: this.messages.sync,
					default: true,
				}),
			(error) => this._handleError(error, "Failed to prompt for sync confirmation"),
		)();
	}

	promptForSyncWithInput(): Promise<Result<string, AppError>> {
		return Result.wrap(
			() =>
				Input.prompt({
					message: this.messages.sync,
					suggestions: ["Y", "n"],
					default: "Y",
				}),
			(error) => this._handleError(error, "Failed to prompt for sync confirmation"),
		)();
	}

	promptForEnableAndSync(workspacePath: string): Promise<Result<boolean, AppError>> {
		return Result.wrap(
			() =>
				Confirm.prompt({
					message: this.messages.enableAndSync(workspacePath),
					default: true,
				}),
			(error) => this._handleError(error, "Failed to prompt for enable and sync confirmation"),
		)();
	}

	promptForWorkspaceSelection(workspaces: Array<{ path: string; url: string; active: boolean }>): Promise<Result<string[], AppError>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.path} (${workspace.url})`,
			value: workspace.path,
			checked: workspace.active,
		}));

		return Result.wrap(
			() =>
				Checkbox.prompt({
					message: this.messages.workspaceSelection,
					search: true,
					options,
				}),
			(error) => this._handleError(error, "Failed to prompt for workspace selection"),
		)();
	}

	async promptForWorkspaceSelectionSingle(workspaces: Array<{ path: string; url: string; branch: string; active: boolean }>): Promise<Result<string | null, AppError>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})`,
			value: workspace.path,
		}));

		options.push({
			name: this.messages.cancel,
			value: "cancel",
		});

		const result = await Result.wrap(
			() =>
				Select.prompt({
					message: this.messages.workspaceOpen,
					options: options,
					search: true,
				}),
			(error) => this._handleError(error, "Failed to prompt for workspace selection"),
		)();

		if (result.ok && result.value === "cancel") {
			return Result.ok(null);
		}
		return result;
	}
}
