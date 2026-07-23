import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { AppErrorCode } from "../libs/app-error.ts";
import { WorkspaceDiscovery } from "./workspace-discovery.ts";

/**
 * Write a minimal workspace.yml fixture into a directory.
 */
function writeFixture(dir: string, content?: string): string {
	const path = join(dir, "workspace.yml");
	Deno.writeTextFileSync(path, content ?? "workspaces: []");
	return path;
}

Deno.test("WorkspaceDiscovery: both config and workspaceRoot → uses them directly", async () => {
	const root = await Deno.makeTempDir();
	const configRel = "sub/workspace.yml";
	const configPath = join(root, configRel);
	Deno.mkdirSync(join(root, "sub"), { recursive: true });
	writeFixture(join(root, "sub"));

	const discovery = new WorkspaceDiscovery({
		config: configRel,
		workspaceRoot: root,
		startDir: root,
	});

	const result = await discovery.discover();

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.workspaceRoot, root);
	assertEquals(result.value.configPath, configPath);
});

Deno.test("WorkspaceDiscovery: only config → workspaceRoot derived from config parent", async () => {
	const root = await Deno.makeTempDir();
	const configPath = writeFixture(root);

	const discovery = new WorkspaceDiscovery({
		config: configPath,
		startDir: root,
	});

	const result = await discovery.discover();

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.configPath, configPath);
	// workspaceRoot should be the parent directory of the config file
	assertEquals(result.value.workspaceRoot, join(configPath, ".."));
});

Deno.test("WorkspaceDiscovery: only workspaceRoot → configPath joins root + workspace.yml", async () => {
	const root = await Deno.makeTempDir();
	writeFixture(root);

	const discovery = new WorkspaceDiscovery({
		workspaceRoot: root,
		startDir: root,
	});

	const result = await discovery.discover();

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.workspaceRoot, root);
	assertEquals(result.value.configPath, join(root, "workspace.yml"));
});

Deno.test("WorkspaceDiscovery: neither flag → walks parents until found", async () => {
	const root = await Deno.makeTempDir();
	writeFixture(root);
	const nested = join(root, "a", "b", "c");
	Deno.mkdirSync(nested, { recursive: true });

	const discovery = new WorkspaceDiscovery({ startDir: nested });
	const result = await discovery.discover();

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.workspaceRoot, root);
	assertEquals(result.value.configPath, join(root, "workspace.yml"));
});

Deno.test("WorkspaceDiscovery: not found after walk → error Result (not throw)", async () => {
	const root = await Deno.makeTempDir();
	const nested = join(root, "a", "b", "c");
	Deno.mkdirSync(nested, { recursive: true });

	const discovery = new WorkspaceDiscovery({ startDir: nested });

	// Should return an error Result, not throw
	const result = await discovery.discover();

	assert(!result.ok, "expected error result when config not found");
	assertEquals(result.error.code, AppErrorCode.CONFIG_NOT_FOUND);
});
