import { Command } from "@cliffy/command";
import { red, yellow } from "@std/fmt/colors";
import { syncCommand } from "./cmds/sync.ts";

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
	.option("-y, --yes", "Accept all changes")
	.action(async (options) => {
		await syncCommand({
			config: options.config,
			workspaceRoot: options.workspaceRoot,
			debug: options.debug,
		});
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
	try {
		await cli.parse(Deno.args);
	} catch (error) {
		console.log(red("❌ CLI Error:"), error instanceof Error ? error.message : "Unknown error");
		Deno.exit(1);
	}
}
