import { Command } from "@cliffy/command";
import { red } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { addCommand } from "./cmds/add.ts";
import { enableCommand } from "./cmds/enable.ts";
import { saveCommand } from "./cmds/save.ts";
import { statusCommand } from "./cmds/status.ts";
import { syncCommand } from "./cmds/sync.ts";
import { updateCommand } from "./cmds/update.ts";
import meta from "./deno.json" with { type: "json" };

// Create CLI application
const cli = new Command()
	.name("workspace-manager")
	.version(meta.version)
	.description("Workspace manager for 7solutions");

// Sync command
cli
	.command("sync", "Sync workspace with remote")
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 4,
		},
	)
	.option("-y, --yes", "Accept all changes")
	.action(async (options) => {
		const result = await syncCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
		});
		if (!result.ok) {
			console.log(red("❌ Sync failed:"), result.error.message);
			Deno.exit(1);
		}
	});

// Update command
cli
	.command(
		"update",
		"Update all submodules by checking out to tracking branches and pulling latest changes",
	)
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 4,
		},
	)
	.action(async (options) => {
		const result = await updateCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
		});
		if (!result.ok) {
			console.log(red("❌ Update failed:"), result.error.message);
			Deno.exit(1);
		}
	});

// Enable command
cli
	.command("enable", "Enable a disabled workspace repository")
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 4,
		},
	)
	.option("-y, --yes", "Skip sync confirmation prompt")
	.action(async (options) => {
		const result = await enableCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
			yes: options.yes,
		});
		if (!result.ok) {
			console.log(red("❌ Enable failed:"), result.error.message);
			Deno.exit(1);
		}
	});



// Save command
cli
	.command(
		"save",
		"Save current workspace state by updating workspace.yml with current tracking branches",
	)
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.action(async (options) => {
		const result = await saveCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
		});
		if (!result.ok) {
			console.log(red("❌ Save failed:"), result.error.message);
			Deno.exit(1);
		}
	});

// Add command
cli
	.command(
		"add [repo] [path]",
		"Add a new repository to the workspace configuration",
	)
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 4,
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
		const result = await addCommand({
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
		if (!result.ok) {
			console.log(red("❌ Add failed:"), result.error.message);
			Deno.exit(1);
		}
	});

// Status command
cli
	.command("status", "Show current workspace status")
	.alias("s")
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option(
		"-j, --concurrency <concurrency:number>",
		"Number of concurrent operations",
		{
			default: 4,
		},
	)
	.option("--json", "Output in JSON format", { default: false })
	.option("-v, --verbose", "Show verbose git information", { default: false })
	.action(async (options) => {
		const result = await statusCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
			concurrency: options.concurrency,
			json: options.json,
			verbose: options.verbose,
		});
		if (!result.ok) {
			console.log(red("❌ Status failed:"), result.error.message);
			Deno.exit(1);
		}
	});

// Handle main execution
if (import.meta.main) {
	const result = await Result.fromAsyncCatching(() => cli.parse(Deno.args));
	if (!result.ok) {
		console.log(red("❌ CLI Error:"), result.error.message);
		Deno.exit(1);
	}
}
