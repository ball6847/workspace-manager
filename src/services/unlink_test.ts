import { assert, assertEquals, assertFalse } from "@std/assert";
import { Result } from "typescript-result";
import { AppErrorCode, isAppError } from "../libs/app-error.ts";
import { type UnlinkInput, type UnlinkReport, UnlinkService } from "./unlink.ts";
import { FakeConfigStore, FakeConfirmer, FakeDiscovery, FakeFileSystem, type FakeFsEntry } from "../testing/fakes.ts";
import type { WorkspaceConfig } from "../types/config.ts";

function makeDeps(fs: FakeFileSystem, confirmer: FakeConfirmer, config: WorkspaceConfig): {
	deps: ConstructorParameters<typeof UnlinkService>[0];
	run: (input?: Partial<UnlinkInput>) => Promise<Result<UnlinkReport, unknown>>;
} {
	const discovery = new FakeDiscovery(Result.ok({ workspaceRoot: "/ws", configPath: "/ws/workspace.yml" }));
	const configStore = new FakeConfigStore("/ws/workspace.yml", config);

	const deps = {
		createDiscovery: () => discovery,
		createConfigStore: () => configStore,
		fileSystem: fs,
		confirmer,
	};

	const service = new UnlinkService(deps);

	return {
		deps,
		run: async (input?: Partial<UnlinkInput>) => {
			const result = await service.run({ ...input });
			// Widen type for test assertions
			return result as Result<UnlinkReport, unknown>;
		},
	};
}

Deno.test("TC-U001: happy path — remove file and directory symlinks", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }],
			["/ws/projects/repo1/.agents", { kind: "symlink", target: "../../.agents" }],
			["/ws/prompt/BACKEND.md", { kind: "file" }],
			["/ws/.agents", { kind: "dir" }],
		]),
	);

	const confirmer = new FakeConfirmer([true, true]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: {
					"AGENT.md": "prompt/BACKEND.md",
					".agents": ".agents",
				},
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.unlinkedCount, 2);
		assertEquals(result.value.skippedCount, 0);
		assertEquals(result.value.warnedCount, 0);
	}

	// remove called twice with correct paths
	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 2);
	assert(removeCalls.some((c) => c.args[0] === "/ws/projects/repo1/AGENT.md"));
	assert(removeCalls.some((c) => c.args[0] === "/ws/projects/repo1/.agents"));

	// Symlinks removed from entries
	assertFalse(fs.entries.has("/ws/projects/repo1/AGENT.md"));
	assertFalse(fs.entries.has("/ws/projects/repo1/.agents"));
});

Deno.test("TC-U002: missing destination — silent skip (idempotent)", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/prompt/BACKEND.md", { kind: "file" }],
			// /ws/projects/repo1/AGENT.md does NOT exist
		]),
	);

	const confirmer = new FakeConfirmer([]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.skippedCount, 1);
		assertEquals(result.value.unlinkedCount, 0);
		assertEquals(result.value.warnedCount, 0);
	}

	// No remove calls, no confirm prompts
	assertEquals(fs.calls.filter((c) => c.method === "remove").length, 0);
	assertEquals(confirmer.messages.length, 0);
});

Deno.test("TC-U003: non-symlink destination — warn and skip", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "file" }], // real file, NOT a symlink
			["/ws/prompt/BACKEND.md", { kind: "file" }],
		]),
	);

	const confirmer = new FakeConfirmer([]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.warnedCount, 1);
		assertEquals(result.value.unlinkedCount, 0);
		assertEquals(result.value.skippedCount, 0);
	}

	// No remove calls, no confirm prompts (we don't prompt for real files)
	assertEquals(fs.calls.filter((c) => c.method === "remove").length, 0);
	assertEquals(confirmer.messages.length, 0);
});

Deno.test("TC-U004: user confirms removal", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }],
			["/ws/prompt/BACKEND.md", { kind: "file" }],
		]),
	);

	const confirmer = new FakeConfirmer([true]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.unlinkedCount, 1);
	}

	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 1);
	assertEquals(removeCalls[0].args[0], "/ws/projects/repo1/AGENT.md");

	// Confirm message includes the destination path
	assert(confirmer.messages.length > 0);
	assert(confirmer.messages[0].includes("/ws/projects/repo1/AGENT.md"));
});

Deno.test("TC-U005: user declines removal", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }],
			["/ws/prompt/BACKEND.md", { kind: "file" }],
		]),
	);

	const confirmer = new FakeConfirmer([false]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.skippedCount, 1);
		assertEquals(result.value.unlinkedCount, 0);
	}

	// No remove calls
	assertEquals(fs.calls.filter((c) => c.method === "remove").length, 0);

	// Symlink still in filesystem
	assert(fs.entries.has("/ws/projects/repo1/AGENT.md"));
});

Deno.test("TC-U006: missing submodule directory — warn and skip workspace", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			// projects/repo1 is MISSING (not synced)
			["/ws/projects/repo2", { kind: "dir" }],
			["/ws/projects/repo2/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }],
			["/ws/prompt/BACKEND.md", { kind: "file" }],
		]),
	);

	const confirmer = new FakeConfirmer([true]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
			{
				url: "git@example.com:a/r2.git",
				path: "projects/repo2",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "prompt/BACKEND.md" },
			},
		],
	};

	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...args: string[]) => logs.push(args.join(" "));

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	console.log = originalLog;

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.skippedWorkspaceCount, 1);
		assertEquals(result.value.unlinkedCount, 1);
	}

	// Warning mentions sync
	const warning = logs.find((l) => l.includes("sync"));
	assert(warning !== undefined);
});

Deno.test("TC-U007: no linkable workspaces — zeroed report", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
		]),
	);

	const confirmer = new FakeConfirmer([]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				// no link field
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.unlinkedCount, 0);
		assertEquals(result.value.skippedCount, 0);
		assertEquals(result.value.warnedCount, 0);
		assertEquals(result.value.skippedWorkspaceCount, 0);
	}

	// No FS calls
	assertEquals(fs.calls.length, 0);
});

Deno.test("TC-U008: invalid link paths — CONFIG_INVALID error", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
		]),
	);

	const confirmer = new FakeConfirmer([]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "../evil": "x" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
	}

	// No FS calls
	assertEquals(fs.calls.length, 0);
});

Deno.test("TC-U009: mixed — some removed, some skipped, some warned", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }], // symlink → remove
			["/ws/projects/repo1/REAL.md", { kind: "file" }], // real file → warn
			// OTHER.md does NOT exist → skip
			["/ws/prompt/BACKEND.md", { kind: "file" }],
		]),
	);

	const confirmer = new FakeConfirmer([true]);

	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@example.com:a/r1.git",
				path: "projects/repo1",
				branch: "main",
				isGolang: false,
				active: true,
				link: {
					"AGENT.md": "prompt/BACKEND.md", // symlink exists → remove
					"OTHER.md": "other/source.md", // missing → skip
					"REAL.md": "prompt/BACKEND.md", // real file at dest → warn
				},
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.unlinkedCount, 1);
		assertEquals(result.value.skippedCount, 1);
		assertEquals(result.value.warnedCount, 1);
	}

	// Only AGENT.md removed
	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 1);
	assertEquals(removeCalls[0].args[0], "/ws/projects/repo1/AGENT.md");
});
