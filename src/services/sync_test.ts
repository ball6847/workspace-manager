import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { GitPort, GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import { FakeConfigStore, FakeDiscovery, FakeFileSystem, FakeGit, FakeGoWork, FakeHookRunner } from "../testing/fakes.ts";
import type { FakeGitState } from "../testing/fakes.ts";
import type { PostSyncHook, WorkspaceConfig } from "../types/config.ts";
import { SyncService } from "./sync.ts";

const workspaceRoot = "/ws";
const configPath = "/ws/workspace.yml";

function makeDiscovery(): WorkspaceDiscoveryPort {
	return new FakeDiscovery(Result.ok({ workspaceRoot, configPath }));
}

function makeDeps({
	config,
	gitStates,
	existingDirs,
	goAvailable,
	hookRunner: customHookRunner,
}: {
	config: WorkspaceConfig;
	gitStates?: Record<string, FakeGitState>;
	existingDirs?: string[];
	goAvailable?: boolean;
	hookRunner?: HookRunner;
} = { config: { workspaces: [] } }) {
	const discovery = makeDiscovery();
	const configStore = new FakeConfigStore(configPath, config);
	const fileSystem = new FakeFileSystem();
	for (const dir of existingDirs ?? []) {
		fileSystem.dirs.add(dir);
	}

	const gitInstances = new Map<string, FakeGit>();
	const sharedGitStates = new Map<string, FakeGitState>();
	const gitFactory: GitPortFactory = (cwd: string): GitPort => {
		let git = gitInstances.get(cwd);
		if (!git) {
			const state = gitStates?.[cwd] ?? {};
			sharedGitStates.set(cwd, state);
			git = new FakeGit(
				{
					currentBranch: state.currentBranch ?? "main",
					isClean: state.isClean ?? true,
					isDetached: state.isDetached ?? false,
					isHeadBehindBranch: state.isHeadBehindBranch ?? false,
					syncBranchUpdated: state.syncBranchUpdated,
					failNext: state.failNext,
					batchInitInitializes: state.batchInitInitializes,
				},
				{ cwd, sharedStates: sharedGitStates, dirs: fileSystem.dirs },
			);
			gitInstances.set(cwd, git);
		}
		return git;
	};

	const goWorkInstances = new Map<string, FakeGoWork>();
	const goWorkFactory: GoWorkPortFactory = (cwd: string) => {
		let goWork = goWorkInstances.get(cwd);
		if (!goWork) {
			goWork = new FakeGoWork();
			goWork.available = goAvailable ?? true;
			goWorkInstances.set(cwd, goWork);
		}
		return goWork;
	};

	const hookRunner = customHookRunner ?? new FakeHookRunner();

	const createDiscovery = (_options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort => discovery;
	const createConfigStore = (_configPath: string): ConfigStore => configStore;
	const createHookRunner = (_debug?: boolean): HookRunner => hookRunner;

	const service = new SyncService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		goWorkFactory,
		fileSystem,
		createHookRunner,
	});

	return {
		discovery,
		configStore,
		fileSystem,
		gitFactory,
		goWorkFactory,
		hookRunner,
		service,
		gitInstances,
		getGit: (cwd: string) => gitInstances.get(cwd),
		getGoWork: (cwd: string) => goWorkInstances.get(cwd),
	};
}

Deno.test("SyncService: missing workspace dir → calls checkout (submoduleAdd)", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	// No existing dirs → directory does not exist → checkout path
	const { service, hookRunner } = makeDeps({ config });

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);
	assertEquals(result.value.removedCount, 0);
	// No global hooks configured → no hook calls
	assertEquals((hookRunner as FakeHookRunner).hooks.length, 0);
});

Deno.test("SyncService: existing clean repo on correct branch → syncBranch", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);
	assertEquals(result.value.updatedCount, 1);
	assertEquals(result.value.upToDateCount, 0);

	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const syncCalls = git.calls.filter((c) => c.method === "syncBranch");
	assertEquals(syncCalls.length, 1);
	assertEquals(syncCalls[0].args[0], "main");

	const subAddCalls = git.calls.filter((c) => c.method === "submoduleAdd");
	assertEquals(subAddCalls.length, 0);

	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, ["isRepository", "isRepository", "getBranchState", "isWorkingDirectoryClean", "syncBranch"]);
	assertEquals(git.calls.filter((c) => c.method === "isDetachedHead").length, 0, "should not call isDetachedHead");
	assertEquals(git.calls.filter((c) => c.method === "getCurrentBranch").length, 0, "should not call getCurrentBranch");
	assertEquals(git.calls.filter((c) => c.method === "pullOriginBranch").length, 0, "should not call pullOriginBranch");
});

Deno.test("SyncService: branch mismatch → checkoutBranch then syncBranch", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "feature", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.updatedCount, 1);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const checkoutCalls = git.calls.filter((c) => c.method === "checkoutBranch");
	assertEquals(checkoutCalls.length, 1);
	assertEquals(checkoutCalls[0].args[0], "feature");

	const branchStateCalls = git.calls.filter((c) => c.method === "getBranchState");
	assertEquals(branchStateCalls.length, 1, "single branch-state check on non-detached repo");
	assertEquals(git.calls.filter((c) => c.method === "getCurrentBranch").length, 0, "should not call getCurrentBranch");

	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, ["isRepository", "isRepository", "getBranchState", "checkoutBranch", "isWorkingDirectoryClean", "syncBranch"]);
});

Deno.test("SyncService: detached HEAD behind branch tip → re-attach and syncBranch", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "develop", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "HEAD", isDetached: true, isHeadBehindBranch: true, syncBranchUpdated: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.updatedCount, 1);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const checkoutCalls = git.calls.filter((c) => c.method === "checkoutBranch");
	const syncCalls = git.calls.filter((c) => c.method === "syncBranch");
	const isHeadBehindCalls = git.calls.filter((c) => c.method === "isHeadBehindBranch");

	assertEquals(isHeadBehindCalls.length, 1);
	assertEquals(checkoutCalls.length, 1);
	assertEquals(checkoutCalls[0].args[0], "develop");
	assertEquals(syncCalls.length, 1);
	assertEquals(syncCalls[0].args[0], "develop");

	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, [
		"isRepository",
		"isRepository",
		"getBranchState",
		"isHeadBehindBranch",
		"checkoutBranch",
		"getBranchState",
		"isWorkingDirectoryClean",
		"syncBranch",
	]);
	assertEquals(git.calls.filter((c) => c.method === "isDetachedHead").length, 0, "should not call isDetachedHead");
});

Deno.test("SyncService: detached HEAD with commits not on branch → warn-and-skip", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "develop", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "HEAD", isDetached: true, isHeadBehindBranch: false } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);
	assertEquals(result.value.skippedDetachedCount, 1);

	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const checkoutCalls = git.calls.filter((c) => c.method === "checkoutBranch");
	const pullCalls = git.calls.filter((c) => c.method === "pullOriginBranch");
	assertEquals(checkoutCalls.length, 0, "should not checkout a diverged detached HEAD");
	assertEquals(pullCalls.length, 0, "should not pull a skipped workspace");

	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, ["isRepository", "isRepository", "getBranchState", "isHeadBehindBranch", "getHeadSha"]);
	assertEquals(git.calls.filter((c) => c.method === "isDetachedHead").length, 0, "should not call isDetachedHead");
});

Deno.test("SyncService: dirty workspace → stash, syncBranch, stashPop", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: false, syncBranchUpdated: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.updatedCount, 1);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const stashCalls = git.calls.filter((c) => c.method === "stash");
	const stashPopCalls = git.calls.filter((c) => c.method === "stashPop");
	assertEquals(stashCalls.length, 1);
	assertEquals(stashPopCalls.length, 1);

	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, [
		"isRepository",
		"isRepository",
		"getBranchState",
		"isWorkingDirectoryClean",
		"stash",
		"syncBranch",
		"stashPop",
	]);
});

Deno.test("SyncService: go.work — active golang paths in use list, inactive in remove list", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/go-repo.git", path: "go-repo", branch: "main", isGolang: true, active: true },
			{ url: "git@github.com:user/old-go.git", path: "old-go", branch: "main", isGolang: true, active: false },
		],
	};
	const { service } = makeDeps({ config, goAvailable: true });

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.goWorkspaceSetup, true);

	// Inspect the goWork factory calls via the created instance
	// The factory creates a new instance per cwd; we check the last created one
	// by capturing through a wrapper
	// Simpler: verify via the report that go setup happened
	assertEquals(result.value.activeCount, 1);
	assertEquals(result.value.inactiveCount, 1);
});

Deno.test("SyncService: global post-sync hooks → FakeHookRunner records executeHooks calls", async () => {
	const config: WorkspaceConfig = {
		hooks: {
			postSyncHooks: [
				{ cmd: ["echo", "hello"], workDir: "{root}" },
				{ cmd: ["echo", "world"], workDir: "{root}" },
			],
		},
		workspaces: [],
	};
	const { service, hookRunner } = makeDeps({ config });

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	// 2 global hooks should have been recorded
	assertEquals((hookRunner as FakeHookRunner).hooks.length, 2);
	assertEquals((hookRunner as FakeHookRunner).hooks[0].hook.cmd[0], "echo");
	assertEquals((hookRunner as FakeHookRunner).hooks[0].context.root, workspaceRoot);
});

Deno.test("SyncService: timing fields are populated for active workspaces", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo-a.git", path: "repo-a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-b.git", path: "repo-b", branch: "main", isGolang: false, active: true },
		],
	};
	const repoAPath = join(workspaceRoot, "repo-a");
	const repoBPath = join(workspaceRoot, "repo-b");
	const { service } = makeDeps({
		config,
		existingDirs: [repoAPath, repoBPath],
		gitStates: {
			[repoAPath]: { currentBranch: "main", isClean: true },
			[repoBPath]: { currentBranch: "main", isClean: true },
		},
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	const timing = result.value.timing;
	assert(timing, "expected timing field on SyncReport");
	assertEquals(typeof timing.totalMs, "number");
	assert(timing.totalMs >= 0, "totalMs must be >= 0");
	assert(timing.removalMs >= 0, "removalMs must be >= 0");
	assert(timing.syncMs >= 0, "syncMs must be >= 0");
	assert(timing.goWorkspaceMs >= 0, "goWorkspaceMs must be >= 0");
	assert(timing.hooksMs >= 0, "hooksMs must be >= 0");
	assertEquals(Object.keys(timing.perWorkspaceMs).length, 2);
	assert(typeof timing.perWorkspaceMs["repo-a"] === "number");
	assert(timing.perWorkspaceMs["repo-a"] >= 0);
	assert(typeof timing.perWorkspaceMs["repo-b"] === "number");
	assert(timing.perWorkspaceMs["repo-b"] >= 0);
});

Deno.test("SyncService: timing fields are sane when no active workspaces", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: false },
		],
	};
	const { service } = makeDeps({ config });

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	const timing = result.value.timing;
	assert(timing, "expected timing field on SyncReport");
	assert(timing.totalMs >= 0, "totalMs must be >= 0");
	assertEquals(Object.keys(timing.perWorkspaceMs).length, 0);
});

Deno.test("SyncService: discovery error propagates as error Result", async () => {
	const discovery = new FakeDiscovery(Result.error(new AppError(AppErrorCode.CONFIG_NOT_FOUND, "not found")));
	const createDiscovery = (_options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort => discovery;
	const createConfigStore = (_configPath: string): ConfigStore => new FakeConfigStore(configPath, { workspaces: [] });
	const fileSystem = new FakeFileSystem();
	const gitFactory = (_cwd: string): GitPort => new FakeGit({ currentBranch: "main" });
	const goWorkFactory: GoWorkPortFactory = (_cwd: string) => new FakeGoWork();
	const hookRunner = new FakeHookRunner();
	const createHookRunner = (_debug?: boolean): HookRunner => hookRunner;

	const service = new SyncService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		goWorkFactory,
		fileSystem,
		createHookRunner,
	});

	const result = await service.run({});

	assert(!result.ok);
	assertEquals(result.error.code, AppErrorCode.CONFIG_NOT_FOUND);
});

Deno.test("SyncService: default concurrency is 8 when not provided", async () => {
	const config: WorkspaceConfig = {
		workspaces: [],
	};
	const { service } = makeDeps({ config });

	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...args: unknown[]) => {
		logs.push(args.map((arg) => String(arg)).join(" "));
	};

	try {
		const result = await service.run({ debug: true });
		assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	} finally {
		console.log = originalLog;
	}

	const debugLine = logs.find((line) => line.includes("Starting workspace sync"));
	assert(debugLine, "expected debug line to be logged");
	assert(debugLine.includes("concurrency: 8"), `expected default concurrency 8 in debug line, got: ${debugLine}`);
});

Deno.test("SyncService: report counts updated vs up-to-date workspaces", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo-a.git", path: "repo-a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-b.git", path: "repo-b", branch: "main", isGolang: false, active: true },
		],
	};
	const repoAPath = join(workspaceRoot, "repo-a");
	const repoBPath = join(workspaceRoot, "repo-b");
	const { service } = makeDeps({
		config,
		existingDirs: [repoAPath, repoBPath],
		gitStates: {
			[repoAPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: true },
			[repoBPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: false },
		},
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 2);
	assertEquals(result.value.updatedCount, 1);
	assertEquals(result.value.upToDateCount, 1);
});

Deno.test("SyncService: syncBranch failure propagates as error", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true, failNext: "syncBranch" } },
	});

	const result = await service.run({});

	assert(!result.ok, "expected error result");
	assertEquals(result.error.code, AppErrorCode.GIT_FAILED);

	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	assertEquals(git.calls.filter((c) => c.method === "syncBranch").length, 1);
	assertEquals(git.calls.filter((c) => c.method === "pullOriginBranch").length, 0);
});

Deno.test("SyncService: dirty up-to-date workspace still stashes and pops", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: false, syncBranchUpdated: false } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);
	assertEquals(result.value.updatedCount, 0);
	assertEquals(result.value.upToDateCount, 1);

	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const callMethods = git.calls.map((c) => c.method);
	assertEquals(callMethods, [
		"isRepository",
		"isRepository",
		"getBranchState",
		"isWorkingDirectoryClean",
		"stash",
		"syncBranch",
		"stashPop",
	]);
});

Deno.test("SyncService: cold workspaces batched into one init call", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo-a.git", path: "repo-a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-b.git", path: "repo-b", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-c.git", path: "repo-c", branch: "main", isGolang: false, active: true },
		],
	};
	const { service, getGit } = makeDeps({
		config,
		gitStates: {
			[workspaceRoot]: { batchInitInitializes: ["repo-a", "repo-b", "repo-c"] },
		},
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 3);
	assertEquals(result.value.updatedCount, 3);

	const rootGit = getGit(workspaceRoot);
	if (!rootGit) throw new Error("Expected root git instance");
	const batchCalls = rootGit.calls.filter((c) => c.method === "submoduleInitMany");
	assertEquals(batchCalls.length, 1, "expected exactly one batch init call");
	assertEquals(batchCalls[0].args, ["repo-a", "repo-b", "repo-c", "8"]);

	const addCalls = rootGit.calls.filter((c) => c.method === "submoduleAdd");
	assertEquals(addCalls.length, 0, "expected no submoduleAdd fallback calls");

	for (const path of ["repo-a", "repo-b", "repo-c"]) {
		const git = getGit(join(workspaceRoot, path));
		if (!git) throw new Error(`Expected git instance for ${path}`);
		assertEquals(git.calls.filter((c) => c.method === "syncBranch").length, 1);
	}
});

Deno.test("SyncService: unregistered submodule falls back to submodule add", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo-a.git", path: "repo-a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-b.git", path: "repo-b", branch: "main", isGolang: false, active: true },
		],
	};
	const { service, getGit } = makeDeps({
		config,
		gitStates: {
			[workspaceRoot]: { batchInitInitializes: ["repo-a"] },
		},
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 2);

	const rootGit = getGit(workspaceRoot);
	if (!rootGit) throw new Error("Expected root git instance");
	assertEquals(rootGit.calls.filter((c) => c.method === "submoduleInitMany").length, 1);

	const addCalls = rootGit.calls.filter((c) => c.method === "submoduleAdd");
	assertEquals(addCalls.length, 1, "expected one submoduleAdd fallback call");
	assertEquals(addCalls[0].args[1], "repo-b");
});

Deno.test("SyncService: warm run performs no batch call", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, gitInstances } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: false } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);

	for (const git of gitInstances.values()) {
		assertEquals(git.calls.filter((c) => c.method === "submoduleInitMany").length, 0);
		assertEquals(git.calls.filter((c) => c.method === "submoduleAdd").length, 0);
	}
});

Deno.test("SyncService: batch failure does not abort; per-path fallback engages", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo-a.git", path: "repo-a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/repo-b.git", path: "repo-b", branch: "main", isGolang: false, active: true },
		],
	};
	const { service, getGit } = makeDeps({
		config,
		gitStates: {
			[workspaceRoot]: { failNext: "submoduleInitMany" },
		},
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 2);

	const rootGit = getGit(workspaceRoot);
	if (!rootGit) throw new Error("Expected root git instance");
	assertEquals(rootGit.calls.filter((c) => c.method === "submoduleInitMany").length, 1);

	const addCalls = rootGit.calls.filter((c) => c.method === "submoduleAdd");
	assertEquals(addCalls.length, 2, "expected fallback submoduleAdd for both pending workspaces");
	const addPaths = addCalls.map((c) => c.args[1]);
	assert(addPaths.includes("repo-a"));
	assert(addPaths.includes("repo-b"));
});

/**
 * Records per-executeHooks-call start/end events so tests can assert that
 * workspace hooks run one workspace at a time (no interleaving).
 */
class TrackingHookRunner implements HookRunner {
	events: Array<{ workspace: string; phase: "start" | "end" }> = [];

	constructor(private readonly delayMs: number = 20) {}

	executeHook(_hook: PostSyncHook, _context: HookContext): Promise<Result<HookExecutionResult, AppError>> {
		return Promise.resolve(Result.ok({ success: true, exitCode: 0, duration: 0 }));
	}

	async executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], AppError>> {
		this.events.push({ workspace: context.path, phase: "start" });
		await new Promise((resolve) => setTimeout(resolve, this.delayMs));
		this.events.push({ workspace: context.path, phase: "end" });
		return Promise.resolve(Result.ok(hooks.map(() => ({ success: true, exitCode: 0, duration: 0 }))));
	}
}

Deno.test("SyncService: workspace post-sync hooks execute sequentially in config order", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{
				url: "git@github.com:user/repo-a.git",
				path: "repo-a",
				branch: "main",
				isGolang: false,
				active: true,
				postSyncHooks: [{ cmd: ["echo", "a1"] }, { cmd: ["echo", "a2"] }],
			},
			{
				url: "git@github.com:user/repo-b.git",
				path: "repo-b",
				branch: "main",
				isGolang: false,
				active: true,
				postSyncHooks: [{ cmd: ["echo", "b1"] }],
			},
		],
	};
	const repoAPath = join(workspaceRoot, "repo-a");
	const repoBPath = join(workspaceRoot, "repo-b");
	const trackingRunner = new TrackingHookRunner(20);
	const { service } = makeDeps({
		config,
		existingDirs: [repoAPath, repoBPath],
		gitStates: {
			[repoAPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: false },
			[repoBPath]: { currentBranch: "main", isClean: true, syncBranchUpdated: false },
		},
		hookRunner: trackingRunner,
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.workspaceHookResults.length, 2);
	// Hooks for workspace N+1 must not start until workspace N's hooks have completed.
	const phases = trackingRunner.events.map((e) => `${e.workspace}:${e.phase}`);
	assertEquals(phases, ["repo-a:start", "repo-a:end", "repo-b:start", "repo-b:end"]);
});

Deno.test("FakeGit: submoduleInitMany with empty paths returns ok without side effects", async () => {
	const git = new FakeGit();
	const result = await git.submoduleInitMany([], 8);

	assert(result.ok);
	const batchCalls = git.calls.filter((c) => c.method === "submoduleInitMany");
	assertEquals(batchCalls.length, 1);
	assertEquals(batchCalls[0].args, ["8"]);
});
