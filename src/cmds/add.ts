import { blue, red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import type { AppContext } from "../composition.ts";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { extractRepoName } from "../domain/workspaces.ts";
import { InteractivePrompt } from "./interactive-prompt.ts";

export type AddCommandOption = {
	repo?: string;
	path?: string;
	branch?: string;
	go?: boolean;
	sync?: boolean;
	yes?: boolean;
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
	concurrency?: number;
};

export async function addCommand(ctx: AppContext, option: AddCommandOption): Promise<Result<void, AppError>> {
	if (option.yes) {
		return await runNonInteractiveMode(ctx, option);
	}

	return await runInteractiveMode(ctx, option);
}

async function runNonInteractiveMode(ctx: AppContext, option: AddCommandOption): Promise<Result<void, AppError>> {
	if (!option.repo) {
		console.log(red("❌ Repository URL is required in non-interactive mode (-y)"));
		return Result.error(new AppError(AppErrorCode.INTERNAL, "Repository URL is required in non-interactive mode"));
	}

	const addResult = await ctx.addService.add({
		config: option.config,
		workspaceRoot: option.workspaceRoot,
		debug: option.debug,
		repo: option.repo,
		path: option.path,
		branch: option.branch,
		isGolang: option.go,
	});

	if (!addResult.ok) {
		return Result.error(addResult.error);
	}

	if (option.sync && addResult.value.added) {
		const syncResult = await ctx.syncService.run({
			config: addResult.value.configPath,
			workspaceRoot: addResult.value.workspaceRoot,
			debug: option.debug,
			concurrency: option.concurrency,
		});
		if (!syncResult.ok) {
			console.log(red("❌ Sync failed:"), syncResult.error.message);
			return Result.error(syncResult.error);
		}
	}

	return Result.ok();
}

async function runInteractiveMode(ctx: AppContext, option: AddCommandOption): Promise<Result<void, AppError>> {
	const interactivePrompt = new InteractivePrompt();
	let hasAddedWorkspaces = false;

	while (true) {
		console.log(blue("\n📦 Adding a new workspace repository"));

		const repoResult = await interactivePrompt.promptForRepo(option.repo);
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

		const pathResult = await interactivePrompt.promptForPath(extractRepoName(repo));
		if (!pathResult.ok) {
			if (pathResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(pathResult.error);
		}
		const workspacePath = pathResult.value || extractRepoName(repo);

		const branchResult = await interactivePrompt.promptForBranch();
		if (!branchResult.ok) {
			if (branchResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(branchResult.error);
		}
		const branch = branchResult.value || "main";

		const goResult = await interactivePrompt.promptForGo();
		if (!goResult.ok) {
			if (goResult.error.message.includes("cancelled")) {
				console.log(yellow("⚠️  Operation cancelled"));
				break;
			}
			return Result.error(goResult.error);
		}
		const isGolang = goResult.value;

		const addResult = await ctx.addService.add({
			config: option.config,
			workspaceRoot: option.workspaceRoot,
			debug: option.debug,
			repo,
			path: workspacePath,
			branch,
			isGolang,
		});

		if (!addResult.ok) {
			return Result.error(addResult.error);
		}

		if (addResult.value.alreadyExisted) {
			console.log(yellow(`⚠️  Workspace already exists: ${addResult.value.workspacePath}`));
			continue;
		}

		hasAddedWorkspaces = true;

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

	if (hasAddedWorkspaces) {
		const syncResult = await interactivePrompt.promptForSync();
		if (!syncResult.ok) {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
			return Result.ok();
		}

		if (syncResult.value) {
			const performSyncResult = await ctx.syncService.run({
				config: option.config,
				workspaceRoot: option.workspaceRoot,
				debug: option.debug,
				concurrency: option.concurrency,
			});
			if (!performSyncResult.ok) {
				console.log(red("❌ Sync failed:"), performSyncResult.error.message);
				return Result.error(performSyncResult.error);
			}
		} else {
			console.log(blue("💡 Run 'workspace-manager sync' to apply changes"));
		}
	}

	return Result.ok();
}
