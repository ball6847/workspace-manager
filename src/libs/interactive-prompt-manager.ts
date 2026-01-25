import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

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
};

export class InteractivePromptManager {
	constructor(private readonly messages: PromptMessages = defaultPromptMessages) {}

	private wrapPrompt<T>(promptFn: () => Promise<T>, errorContext: string): Promise<Result<T, Error>> {
		return Result.wrap(
			() => promptFn(),
			(error) => {
				if (error instanceof Error && error.message.includes("cancelled")) {
					return new ErrorWithCause("Operation cancelled", error);
				}
				return new ErrorWithCause(errorContext, error as Error);
			},
		)();
	}

	promptForRepo(defaultRepo?: string): Promise<Result<string, Error>> {
		return this.wrapPrompt(
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
			"Failed to prompt for repository URL",
		);
	}

	promptForPath(defaultPath: string): Promise<Result<string, Error>> {
		return this.wrapPrompt(
			() =>
				Input.prompt({
					message: this.messages.path,
					default: defaultPath,
				}),
			"Failed to prompt for path",
		);
	}

	promptForBranch(): Promise<Result<string, Error>> {
		return this.wrapPrompt(
			() =>
				Input.prompt({
					message: this.messages.branch,
					default: "main",
					suggestions: this.messages.branchSuggestions,
				}),
			"Failed to prompt for branch",
		);
	}

	promptForGo(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messages.go,
					default: false,
				}),
			"Failed to prompt for Go workspace setting",
		);
	}

	promptForContinue(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messages.continue,
					default: false,
				}),
			"Failed to prompt for continue",
		);
	}

	promptForSync(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messages.sync,
					default: true,
				}),
			"Failed to prompt for sync confirmation",
		);
	}

	promptForWorkspaceSelection(workspaces: Array<{ path: string; url: string; active: boolean }>): Promise<Result<string[], Error>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.path} (${workspace.url})`,
			value: workspace.path,
			checked: workspace.active,
		}));

		return this.wrapPrompt(
			() =>
				Checkbox.prompt({
					message: this.messages.workspaceSelection,
					search: true,
					options,
				}),
			"Failed to prompt for workspace selection",
		);
	}

	async promptForWorkspaceSelectionSingle(workspaces: Array<{ path: string; url: string; branch: string; active: boolean }>): Promise<Result<string | null, Error>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})`,
			value: workspace.path,
		}));

		options.push({
			name: this.messages.cancel,
			value: "cancel",
		});

		const result = await this.wrapPrompt(
			() =>
				Select.prompt({
					message: this.messages.workspaceOpen,
					options: options,
					search: true,
				}),
			"Failed to prompt for workspace selection",
		);
		if (result.ok && result.value === "cancel") {
			return Result.ok(null);
		}
		return result;
	}
}
