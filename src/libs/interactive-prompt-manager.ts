import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export interface PromptMessageProvider {
	getRepoMessage(): string;
	getPathMessage(): string;
	getBranchMessage(): string;
	getBranchSuggestions(): string[];
	getGoMessage(): string;
	getContinueMessage(): string;
	getSyncMessage(): string;
	getWorkspaceSelectionMessage(): string;
	getWorkspaceOpenMessage(): string;
	getCancelLabel(): string;
}

export class DefaultPromptMessageProvider implements PromptMessageProvider {
	getRepoMessage(): string {
		return "Repository URL:";
	}

	getPathMessage(): string {
		return "Local path:";
	}

	getBranchMessage(): string {
		return "Branch:";
	}

	getBranchSuggestions(): string[] {
		return ["main", "master", "develop", "staging"];
	}

	getGoMessage(): string {
		return "Is this a Go module?";
	}

	getContinueMessage(): string {
		return "Do you want to add another workspace?";
	}

	getSyncMessage(): string {
		return "Do you want to sync now?";
	}

	getWorkspaceSelectionMessage(): string {
		return "Select workspaces to enable (use space to toggle, enter to confirm):";
	}

	getWorkspaceOpenMessage(): string {
		return "Select workspace to open:";
	}

	getCancelLabel(): string {
		return "Cancel";
	}
}

export class InteractivePromptManager {
	constructor(
		private readonly messageProvider: PromptMessageProvider = new DefaultPromptMessageProvider(),
	) {}

	private wrapPrompt<T>(
		promptFn: () => Promise<T>,
		errorContext: string,
	): Promise<Result<T, Error>> {
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

	async promptForRepo(defaultRepo?: string): Promise<Result<string, Error>> {
		return this.wrapPrompt(
			() =>
				Input.prompt({
					message: this.messageProvider.getRepoMessage(),
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

	async promptForPath(defaultPath: string): Promise<Result<string, Error>> {
		return this.wrapPrompt(
			() =>
				Input.prompt({
					message: this.messageProvider.getPathMessage(),
					default: defaultPath,
				}),
			"Failed to prompt for path",
		);
	}

	async promptForBranch(): Promise<Result<string, Error>> {
		return this.wrapPrompt(
			() =>
				Input.prompt({
					message: this.messageProvider.getBranchMessage(),
					default: "main",
					suggestions: this.messageProvider.getBranchSuggestions(),
				}),
			"Failed to prompt for branch",
		);
	}

	async promptForGo(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messageProvider.getGoMessage(),
					default: false,
				}),
			"Failed to prompt for Go workspace setting",
		);
	}

	async promptForContinue(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messageProvider.getContinueMessage(),
					default: false,
				}),
			"Failed to prompt for continue",
		);
	}

	async promptForSync(): Promise<Result<boolean, Error>> {
		return this.wrapPrompt(
			() =>
				Confirm.prompt({
					message: this.messageProvider.getSyncMessage(),
					default: true,
				}),
			"Failed to prompt for sync confirmation",
		);
	}

	async promptForWorkspaceSelection(
		workspaces: Array<{ path: string; url: string; active: boolean }>,
	): Promise<Result<string[], Error>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.path} (${workspace.url})`,
			value: workspace.path,
			checked: workspace.active,
		}));

		return this.wrapPrompt(
			() =>
				Checkbox.prompt({
					message: this.messageProvider.getWorkspaceSelectionMessage(),
					search: true,
					options,
				}),
			"Failed to prompt for workspace selection",
		);
	}

	async promptForWorkspaceSelectionSingle(
		workspaces: Array<{ path: string; url: string; branch: string; active: boolean }>,
	): Promise<Result<string | null, Error>> {
		const options = workspaces.map((workspace) => ({
			name: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})`,
			value: workspace.path,
		}));

		options.push({
			name: this.messageProvider.getCancelLabel(),
			value: "cancel",
		});

		return this.wrapPrompt(
			() =>
				Select.prompt({
					message: this.messageProvider.getWorkspaceOpenMessage(),
					options: options,
					search: true,
				}),
			"Failed to prompt for workspace selection",
		).then((result) => {
			if (result.ok && result.value === "cancel") {
				return Result.ok(null);
			}
			return result;
		});
	}
}
