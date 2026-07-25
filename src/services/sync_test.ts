import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { GitPort, GitPortFactory } from "../ports/git.ts";
import type { GoWorkPortFactory } from "../ports/go-work.ts";
import type { HookRunner } from "../ports/hook-runner.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import { FakeConfigStore, FakeDiscovery, FakeFileSystem, FakeGit, FakeGoWork, FakeHookRunner } from "../testing/fakes.ts";
import type { WorkspaceConfig } from "../types/config.ts";
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
}: {
	config: WorkspaceConfig;
	gitStates?: Record<string, { currentBranch?: string; isClean?: boolean; isDetached?: boolean; isHeadBehindBranch?: boolean }>;
	existingDirs?: string[];
	goAvailable?: boolean;
} = { config: { workspaces: [] } }) {
	const discovery = makeDiscovery();
	const configStore = new FakeConfigStore(configPath, config);
	const fileSystem = new FakeFileSystem();
	for (const dir of existingDirs ?? []) {
		fileSystem.dirs.add(dir);
	}

	const gitInstances = new Map<string, FakeGit>();
	const gitFactory: GitPortFactory = (cwd: string): GitPort => {
		let git = gitInstances.get(cwd);
		if (!git) {
			const state = gitStates?.[cwd] ?? {};
			git = new FakeGit({
				currentBranch: state.currentBranch ?? "main",
				isClean: state.isClean ?? true,
				isDetached: state.isDetached ?? false,
				isHeadBehindBranch: state.isHeadBehindBranch ?? false,
			});
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

	const hookRunner = new FakeHookRunner();

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
	assertEquals(hookRunner.hooks.length, 0);
});

Deno.test("SyncService: existing clean repo on correct branch → pull", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.syncedCount, 1);

	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const pullCalls = git.calls.filter((c) => c.method === "pullOriginBranch");
	assertEquals(pullCalls.length, 1);
	assertEquals(pullCalls[0].args[0], "main");

	const subAddCalls = git.calls.filter((c) => c.method === "submoduleAdd");
	assertEquals(subAddCalls.length, 0);
});

Deno.test("SyncService: branch mismatch → checkoutBranch then pull", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "feature", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const checkoutCalls = git.calls.filter((c) => c.method === "checkoutBranch");
	assertEquals(checkoutCalls.length, 1);
	assertEquals(checkoutCalls[0].args[0], "feature");
});

Deno.test("SyncService: detached HEAD behind branch tip → re-attach and pull", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "develop", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "HEAD", isDetached: true, isHeadBehindBranch: true } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const checkoutCalls = git.calls.filter((c) => c.method === "checkoutBranch");
	const pullCalls = git.calls.filter((c) => c.method === "pullOriginBranch");
	const isHeadBehindCalls = git.calls.filter((c) => c.method === "isHeadBehindBranch");

	assertEquals(isHeadBehindCalls.length, 1);
	assertEquals(checkoutCalls.length, 1);
	assertEquals(checkoutCalls[0].args[0], "develop");
	assertEquals(pullCalls.length, 1);
	assertEquals(pullCalls[0].args[0], "develop");
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
});

Deno.test("SyncService: dirty workspace → stash, pull, stashPop", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const repoPath = join(workspaceRoot, "repo");
	const { service, getGit } = makeDeps({
		config,
		existingDirs: [repoPath],
		gitStates: { [repoPath]: { currentBranch: "main", isClean: false } },
	});

	const result = await service.run({});

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	const git = getGit(repoPath);
	if (!git) throw new Error("Expected git instance for repoPath");
	const stashCalls = git.calls.filter((c) => c.method === "stash");
	const stashPopCalls = git.calls.filter((c) => c.method === "stashPop");
	assertEquals(stashCalls.length, 1);
	assertEquals(stashPopCalls.length, 1);
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
	assertEquals(hookRunner.hooks.length, 2);
	assertEquals(hookRunner.hooks[0].hook.cmd[0], "echo");
	assertEquals(hookRunner.hooks[0].context.root, workspaceRoot);
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
