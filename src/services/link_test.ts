import { assert, assertEquals, assertFalse } from "@std/assert";
import { Result } from "typescript-result";
import { AppErrorCode, isAppError } from "../libs/app-error.ts";
import { type LinkInput, type LinkReport, LinkService } from "./link.ts";
import { FakeConfigStore, FakeConfirmer, FakeDiscovery, FakeFileSystem, type FakeFsEntry } from "../testing/fakes.ts";
import type { WorkspaceConfig } from "../types/config.ts";

function makeDeps(fs: FakeFileSystem, confirmer: FakeConfirmer, config: WorkspaceConfig): {
	deps: ConstructorParameters<typeof LinkService>[0];
	run: (input?: Partial<LinkInput>) => Promise<Result<LinkReport, unknown>>;
} {
	const discovery = new FakeDiscovery(Result.ok({ workspaceRoot: "/ws", configPath: "/ws/workspace.yml" }));
	const configStore = new FakeConfigStore("/ws/workspace.yml", config);

	const deps = {
		createDiscovery: () => discovery,
		createConfigStore: () => configStore,
		fileSystem: fs,
		confirmer,
	};

	const service = new LinkService(deps);

	return {
		deps,
		run: async (input?: Partial<LinkInput>) => {
			const result = await service.run({ ...input });
			// Widen type for test assertions
			return result as Result<LinkReport, unknown>;
		},
	};
}

Deno.test("TC-201: happy path — create file and directory links", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/.agents", { kind: "dir" }],
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
				link: {
					".agents": ".agents",
					"AGENT.md": "prompt/BACKEND.md",
					"config/deep/AGENT.md": "prompt/BACKEND.md",
				},
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.linkedCount, 3);
		assertEquals(result.value.skippedCount, 0);
	}

	// Inspect createSymlink calls
	const symlinkCalls = fs.calls.filter((c) => c.method === "createSymlink");
	assertEquals(symlinkCalls.length, 3);

	const targets = symlinkCalls.map((c) => c.args[0] as string);
	assert(targets.includes("../../.agents"));
	assert(targets.includes("../../prompt/BACKEND.md"));
	assert(targets.includes("../../../../prompt/BACKEND.md"));

	// ensureDir called for config/deep parent
	const ensureDirCalls = fs.calls.filter((c) => c.method === "ensureDir");
	assert(ensureDirCalls.length >= 1);

	// No confirm calls
	assertEquals(confirmer.messages.length, 0);
});

Deno.test("TC-202: all-or-nothing — one missing source aborts everything", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo2", { kind: "dir" }],
			// /ws/prompt/BACKEND.md exists (for repo1)
			["/ws/prompt/BACKEND.md", { kind: "file" }],
			// repo2 source is MISSING
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
			{
				url: "git@example.com:a/r2.git",
				path: "projects/repo2",
				branch: "main",
				isGolang: false,
				active: true,
				link: { "AGENT.md": "missing/source.md" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.LINK_VALIDATION_FAILED);
		const violations = result.error.context?.violations as string[] | undefined;
		assert(violations !== undefined);
		assert(violations.length > 0);
	}

	// No mutations
	const mutatingCalls = fs.calls.filter((c) => ["createSymlink", "remove", "ensureDir"].includes(c.method));
	assertEquals(mutatingCalls.length, 0);
});

Deno.test("TC-203: real directory at destination aborts run", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/.agents", { kind: "dir" }], // real dir at destination
			["/ws/.agents", { kind: "dir" }], // source exists
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
				link: { ".agents": ".agents" },
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assertFalse(result.ok);
	if (!result.ok) {
		assert(isAppError(result.error));
		assertEquals(result.error.code, AppErrorCode.LINK_VALIDATION_FAILED);
	}

	// No mutations, no confirm calls
	const mutatingCalls = fs.calls.filter((c) => ["createSymlink", "remove", "ensureDir"].includes(c.method));
	assertEquals(mutatingCalls.length, 0);
	assertEquals(confirmer.messages.length, 0);
});

Deno.test("TC-204: conflicting real file — user confirms overwrite", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "file" }], // real file at destination
			["/ws/prompt/BACKEND.md", { kind: "file" }], // source exists
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
		assertEquals(result.value.linkedCount, 1);
		assertEquals(result.value.skippedCount, 0);
	}

	// remove called before createSymlink
	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 1);
	assertEquals(removeCalls[0].args[0], "/ws/projects/repo1/AGENT.md");

	// Confirm message mentions destination
	assert(confirmer.messages.length > 0);
	assert(confirmer.messages[0].includes("AGENT.md"));
});

Deno.test("TC-205: conflicting real file — user declines", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "file" }], // first entry: real file conflict
			// OTHER.md destination does NOT exist (missing)
			["/ws/prompt/BACKEND.md", { kind: "file" }],
			["/ws/other/source.md", { kind: "file" }],
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
				link: {
					"AGENT.md": "prompt/BACKEND.md", // conflicts → user declines
					"OTHER.md": "other/source.md", // missing → should be created
				},
			},
		],
	};

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.skippedCount, 1);
		assertEquals(result.value.linkedCount, 1);
	}

	// First destination should NOT have been removed
	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 0);
});

Deno.test("TC-206: already-correct symlink is counted as linked (idempotent)", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/BACKEND.md" }],
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
		assertEquals(result.value.linkedCount, 1);
		assertEquals(result.value.skippedCount, 0);
	}

	// Zero mutating calls, zero confirm calls
	const mutatingCalls = fs.calls.filter((c) => ["createSymlink", "remove", "ensureDir"].includes(c.method));
	assertEquals(mutatingCalls.length, 0);
	assertEquals(confirmer.messages.length, 0);
});

Deno.test("TC-207: symlink pointing elsewhere prompts for replacement", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			["/ws/projects/repo1", { kind: "dir" }],
			["/ws/projects/repo1/AGENT.md", { kind: "symlink", target: "../../prompt/WRONG.md" }],
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
		assertEquals(result.value.linkedCount, 1);
	}

	// remove + createSymlink called
	const removeCalls = fs.calls.filter((c) => c.method === "remove");
	assertEquals(removeCalls.length, 1);
	const symlinkCalls = fs.calls.filter((c) => c.method === "createSymlink");
	assertEquals(symlinkCalls.length, 1);
});

Deno.test("TC-208: missing submodule directory warns and skips", async () => {
	const fs = new FakeFileSystem(
		new Map<string, FakeFsEntry>([
			["/ws", { kind: "dir" }],
			// projects/repo1 is MISSING (not synced)
			["/ws/projects/repo2", { kind: "dir" }],
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

	// Capture console output
	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...args: string[]) => logs.push(args.join(" "));

	const { run } = makeDeps(fs, confirmer, config);
	const result = await run();

	console.log = originalLog;

	assert(result.ok);
	if (result.ok) {
		assertEquals(result.value.skippedWorkspaceCount, 1);
		assertEquals(result.value.linkedCount, 1);
	}

	// Warning mentions sync
	const warning = logs.find((l) => l.includes("sync"));
	assert(warning !== undefined);
});

Deno.test("TC-209: no linkable workspaces returns zeroed report", async () => {
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
		assertEquals(result.value.linkedCount, 0);
		assertEquals(result.value.skippedCount, 0);
		assertEquals(result.value.skippedWorkspaceCount, 0);
	}

	// No FS calls
	assertEquals(fs.calls.length, 0);
});

Deno.test("TC-210: invalid link paths surface as CONFIG_INVALID", async () => {
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

	// No mutating FS calls
	const mutatingCalls = fs.calls.filter((c) => ["createSymlink", "remove", "ensureDir"].includes(c.method));
	assertEquals(mutatingCalls.length, 0);
});
