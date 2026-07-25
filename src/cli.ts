import { Command } from "@cliffy/command";
import { CompletionsCommand } from "@cliffy/command/completions";
import meta from "../deno.json" with { type: "json" };
import { addCommand } from "./cmds/add.ts";
import { enableCommand } from "./cmds/enable.ts";
import { openCommand } from "./cmds/open.ts";
import { saveCommand } from "./cmds/save.ts";
import { statusCommand } from "./cmds/status.ts";
import { syncCommand } from "./cmds/sync.ts";
import { updateCommand } from "./cmds/update.ts";
import { createAppContext } from "./composition.ts";
import { CommandErrorHandler } from "./libs/command-error-handler.ts";
import { linkCommand } from "./cmds/link.ts";
import { unlinkCommand } from "./cmds/unlink.ts";

// Create CLI application
export const cli = new Command()
	.name("workspace-manager")
	.version(meta.version)
	.description("Workspace manager for 7solutions");

// Sync command
cli
	.command("sync", "Sync workspace with remote")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 8,
		},
	)
	.option("-y, --yes", "Accept all changes")
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await syncCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
		});
		CommandErrorHandler.withExit(result, "Sync", { debug: options.debug });
	});

// Update command
cli
	.command(
		"update",
		"Update all submodules by checking out to tracking branches and pulling latest changes",
	)
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 8,
		},
	)
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await updateCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
		});
		CommandErrorHandler.withExit(result, "Update", { debug: options.debug });
	});

// Enable command
cli
	.command("enable", "Enable a disabled workspace repository")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 8,
		},
	)
	.option("-y, --yes", "Skip sync confirmation prompt")
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await enableCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
			yes: options.yes,
		});
		CommandErrorHandler.withExit(result, "Enable", { debug: options.debug });
	});

// Save command
cli
	.command(
		"save",
		"Save current workspace state by updating workspace.yml with current tracking branches",
	)
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await saveCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
		});
		CommandErrorHandler.withExit(result, "Save", { debug: options.debug });
	});

// Add command
cli
	.command(
		"add [repo] [path]",
		"Add a new repository to the workspace configuration",
	)
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 8,
		},
	)
	.option("-b, --branch <branch:string>", "Git branch to checkout", {
		default: "main",
	})
	.option("--go", "Mark as Go module for go.work integration", {
		default: false,
	})
	.option("--sync", "Sync workspace after adding repository", {
		default: false,
	})
	.option(
		"-y, --yes",
		"Skip interactive prompts and use non-interactive mode",
		{ default: false },
	)
	.action(async (options, repo, path) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await addCommand(ctx, {
			repo,
			path,
			branch: options.branch,
			go: options.go,
			sync: options.sync,
			yes: options.yes,
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
		});
		CommandErrorHandler.withExit(result, "Add", { debug: options.debug });
	});

// Status command
cli
	.command("status", "Show current workspace status")
	.alias("s")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 8,
		},
	)
	.option("--json", "Output in JSON format", { default: false })
	.option("-v, --verbose", "Show verbose git information", { default: false })
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await statusCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
			json: options.json,
			verbose: options.verbose,
		});
		CommandErrorHandler.withExit(result, "Status", { debug: options.debug, json: options.json });
	});

// Open command
cli
	.command("open", "Open workspace in configured editor")
	.alias("o")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option("-e, --editor <editor:string>", "Editor to use (overrides config and $EDITOR)")
	.option("--workspace <workspace:string>", "Workspace path to open directly (skips interactive selection)")
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await openCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			editor: options.editor,
			workspace: options.workspace,
		});
		CommandErrorHandler.withExit(result, "Open", { debug: options.debug });
	});

// Link command
cli
	.command("link", "Create symlinks from workspace root files into submodules")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await linkCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
		});
		CommandErrorHandler.withExit(result, "Link", { debug: options.debug });
	});

// Unlink command
cli
	.command("unlink", "Remove symlinks created by the link command")
	.option("-c, --config <config:string>", "Workspace config file (auto-discovers if not specified)")
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root directory (auto-discovers if not specified)")
	.option("-d, --debug", "Enable debug mode", { default: false })
	.action(async (options) => {
		const ctx = createAppContext({ debug: options.debug });
		const result = await unlinkCommand(ctx, {
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
		});
		CommandErrorHandler.withExit(result, "Unlink", { debug: options.debug });
	});

// Completions command
cli
	.command("completions", new CompletionsCommand())
	.description("Generate shell completions");
