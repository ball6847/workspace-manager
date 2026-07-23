import { assert, assertEquals, assertFalse } from "@std/assert";
import { parse } from "@std/yaml";
import { AppErrorCode, isAppError } from "../libs/app-error.ts";
import { parseWorkspaceConfig, type WorkspaceConfig } from "./config-schema.ts";

Deno.test("example/workspace.yml parses successfully", async () => {
	const contents = await Deno.readTextFile("example/workspace.yml");
	const raw = parse(contents);
	const result = parseWorkspaceConfig(raw);

	assert(result.ok);
	assertEquals(result.value.workspaces.length, 16);
	assertEquals(result.value.editor, "nvim");
});

Deno.test("missing required branch field returns CONFIG_INVALID with issues", () => {
	const raw = {
		workspaces: [{
			url: "git@example.com:org/repo.git",
			path: "projects/repo",
			isGolang: false,
			active: true,
		}],
	};

	const result = parseWorkspaceConfig(raw);

	assertFalse(result.ok);
	if (result.ok) {
		return;
	}

	assert(isAppError(result.error));
	assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
	const issues = result.error.context?.issues as Array<{ path: string; message: string }> | undefined;
	assert(issues !== undefined);
	assertEquals(issues[0].path, "workspaces.0.branch");
});

Deno.test("wrong type for active returns CONFIG_INVALID", () => {
	const raw = {
		workspaces: [{
			url: "git@example.com:org/repo.git",
			path: "projects/repo",
			branch: "main",
			isGolang: false,
			active: "yes",
		}],
	};

	const result = parseWorkspaceConfig(raw);

	assertFalse(result.ok);
	if (!result.ok) {
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
		const issues = result.error.context?.issues as Array<{ path: string; message: string }> | undefined;
		assert(issues !== undefined);
	}
});

Deno.test("invalid hook cmd returns CONFIG_INVALID", () => {
	const raw = {
		workspaces: [{
			url: "git@example.com:org/repo.git",
			path: "projects/repo",
			branch: "main",
			isGolang: false,
			active: true,
			postSyncHooks: [{ cmd: [] }],
		}],
	};

	const result = parseWorkspaceConfig(raw);

	assertFalse(result.ok);
	if (!result.ok) {
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
		const issues = result.error.context?.issues as Array<{ path: string; message: string }> | undefined;
		assert(issues !== undefined);
	}
});

Deno.test("empty workspaces array is valid", () => {
	const raw: WorkspaceConfig = { workspaces: [] };
	const result = parseWorkspaceConfig(raw);

	assert(result.ok);
	assertEquals(result.value.workspaces.length, 0);
});

Deno.test("unknown keys are stripped during parse", () => {
	const raw = {
		workspaces: [{
			url: "git@example.com:org/repo.git",
			path: "projects/repo",
			branch: "main",
			isGolang: false,
			active: true,
			unknownField: "should be removed",
		}],
		unknownTopLevel: "also removed",
	};

	const result = parseWorkspaceConfig(raw);

	assert(result.ok);
	assertEquals((result.value.workspaces[0] as Record<string, unknown>).unknownField, undefined);
	assertEquals((result.value as Record<string, unknown>).unknownTopLevel, undefined);
});

Deno.test("valid optional hook fields are accepted", () => {
	const raw = {
		workspaces: [{
			url: "git@example.com:org/repo.git",
			path: "projects/repo",
			branch: "main",
			isGolang: true,
			active: true,
			postSyncHooks: [{
				cmd: ["go", "test", "./..."],
				description: "Run tests",
				workDir: "{path}",
				timeout: 60000,
				env: { GOFLAGS: "-v" },
			}],
		}],
		hooks: {
			postSyncHooks: [{
				cmd: ["echo", "done"],
			}],
		},
	};

	const result = parseWorkspaceConfig(raw);

	assert(result.ok);
	assertEquals(result.value.workspaces[0].postSyncHooks?.length, 1);
	assertEquals(result.value.hooks?.postSyncHooks?.length, 1);
});
