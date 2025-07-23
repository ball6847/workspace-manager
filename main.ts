import { Command } from "@cliffy/command";
import { red, yellow } from "@std/fmt/colors";
import { Result } from "typescript-result";
import { syncCommand } from "./cmds/sync.ts";
import { updateCommand } from "./cmds/update.ts";

const VERSION = "0.0.1-rc1";

// Create CLI application
const cli = new Command()
	.name("workspace-manager")
	.version(VERSION)
	.description("Workspace manager for 7solutions");

// Sync command
cli.command("sync", "Sync workspace with remote")
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
		default: 4,
	})
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
cli.command("update", "Update all submodules by checking out to tracking branches and pulling latest changes")
	.option("-c, --config <config:string>", "Workspace config file", {
		default: "workspace.yml",
	})
	.option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
		default: ".",
	})
	.option("-d, --debug", "Enable debug mode", { default: false })
	.option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
		default: 4,
	})
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

// Status command
cli.command("status", "Show current workspace status")
	.alias("s")
	.action(() => {
		// coming soon
		console.log(yellow("⚠️ Status command is not implemented yet"));
	});

// Handle main execution
if (import.meta.main) {
	const result = await Result.fromAsyncCatching(() => cli.parse(Deno.args));
	if (!result.ok) {
		console.log(red("❌ CLI Error:"), result.error.message);
		Deno.exit(1);
	}
}
