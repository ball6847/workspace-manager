import { assert, assertEquals, assertFalse } from "@std/assert";
import { AppErrorCode, isAppError } from "../libs/app-error.ts";
import { ConfigManager } from "../adapters/config-store.ts";

Deno.test("ConfigManager returns CONFIG_NOT_FOUND when config file is missing", async () => {
	const manager = new ConfigManager("/non/existent/workspace.yml");
	const result = await manager.getConfig();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.CONFIG_NOT_FOUND);
	}
});

Deno.test("ConfigManager returns CONFIG_INVALID for missing required field", async () => {
	const dir = await Deno.makeTempDir();
	const configPath = `${dir}/workspace.yml`;
	await Deno.writeTextFile(
		configPath,
		`
workspaces:
  - url: git@example.com:org/repo.git
    path: projects/repo
    isGolang: false
    active: true
`,
	);

	const manager = new ConfigManager(configPath);
	const result = await manager.getConfig();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
		assert(result.error.context?.issues !== undefined);
	}
});

Deno.test("ConfigManager returns CONFIG_INVALID for malformed YAML", async () => {
	const dir = await Deno.makeTempDir();
	const configPath = `${dir}/workspace.yml`;
	await Deno.writeTextFile(configPath, "workspaces: [unclosed");

	const manager = new ConfigManager(configPath);
	const result = await manager.getConfig();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
	}
});

Deno.test("ConfigManager returns ok for valid config file", async () => {
	const dir = await Deno.makeTempDir();
	const configPath = `${dir}/workspace.yml`;
	await Deno.writeTextFile(
		configPath,
		`
workspaces:
  - url: git@example.com:org/repo.git
    path: projects/repo
    branch: main
    isGolang: false
    active: true
`,
	);

	const manager = new ConfigManager(configPath);
	const result = await manager.getConfig();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.workspaces.length, 1);
	}
});
