import { assert, assertEquals } from "@std/assert";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { GitPort, GitPortFactory } from "../ports/git.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import { FakeConfigStore, FakeDiscovery, FakeFileSystem, FakeGit, FakeLogger } from "../testing/fakes.ts";
import type { WorkspaceConfig } from "../types/config.ts";
import { StatusService } from "./status-service.ts";

function createTestContext({
	config,
	existingDirs,
	gitStates,
}: {
	config: WorkspaceConfig;
	existingDirs?: string[];
	gitStates?: Record<string, { currentBranch?: string; isClean?: boolean; modifiedFiles?: number; untrackedFiles?: number }>;
}) {
	const workspaceRoot = "/ws";
	const configPath = "/ws/workspace.yml";
	const discovery = new FakeDiscovery(Result.ok({ workspaceRoot, configPath }));
	const configStore = new FakeConfigStore(configPath, config);
	const fileSystem = new FakeFileSystem();
	for (const dir of existingDirs ?? []) {
		fileSystem.dirs.add(dir);
	}

	const gitFactory: GitPortFactory = (cwd: string): GitPort => {
		const state = gitStates?.[cwd] ?? {};
		return new FakeGit({
			currentBranch: state.currentBranch ?? "main",
			isClean: state.isClean ?? true,
			modifiedFiles: state.modifiedFiles,
			untrackedFiles: state.untrackedFiles,
		});
	};

	const logger = new FakeLogger();

	const createDiscovery = (_options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort => discovery;
	const createConfigStore = (_configPath: string): ConfigStore => configStore;

	return {
		workspaceRoot,
		configPath,
		discovery,
		configStore,
		fileSystem,
		logger,
		service: new StatusService({ createDiscovery, createConfigStore, gitFactory, fileSystem, logger }),
	};
}

Deno.test("StatusService returns empty report when no active workspaces", async () => {
	const config: WorkspaceConfig = { workspaces: [] };
	const { service } = createTestContext({ config });

	const result = await service.run({});

	assert(result.ok);
	assertEquals(result.value.repositories.length, 0);
});

Deno.test("StatusService marks missing directories as not existing", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const { service } = createTestContext({ config });

	const result = await service.run({});

	assert(result.ok);
	assertEquals(result.value.repositories.length, 1);
	assertEquals(result.value.repositories[0].exists, false);
	assertEquals(result.value.repositories[0].error, "Directory does not exist");
});

Deno.test("StatusService reports clean repository status", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const { service, fileSystem } = createTestContext({
		config,
		existingDirs: ["/ws/repo"],
		gitStates: { "/ws/repo": { currentBranch: "main", isClean: true } },
	});

	const result = await service.run({ verbose: true });

	assert(result.ok);
	assertEquals(result.value.repositories[0].exists, true);
	assertEquals(result.value.repositories[0].currentBranch, "main");
	assertEquals(result.value.repositories[0].isClean, true);
	assertEquals(result.value.repositories[0].modifiedFiles, 0);
	assertEquals(result.value.repositories[0].untrackedFiles, 0);
	assertEquals(fileSystem.dirs.has("/ws/repo"), true);
});

Deno.test("StatusService reports dirty repository with file counts", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/repo.git", path: "repo", branch: "main", isGolang: false, active: true },
		],
	};
	const { service } = createTestContext({
		config,
		existingDirs: ["/ws/repo"],
		gitStates: { "/ws/repo": { currentBranch: "feature", isClean: false, modifiedFiles: 2, untrackedFiles: 1 } },
	});

	const result = await service.run({});

	assert(result.ok);
	assertEquals(result.value.repositories[0].isClean, false);
	assertEquals(result.value.repositories[0].currentBranch, "feature");
	assertEquals(result.value.repositories[0].modifiedFiles, 2);
	assertEquals(result.value.repositories[0].untrackedFiles, 1);
});

Deno.test("StatusService ignores inactive workspaces", async () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@github.com:user/a.git", path: "a", branch: "main", isGolang: false, active: true },
			{ url: "git@github.com:user/b.git", path: "b", branch: "main", isGolang: false, active: false },
		],
	};
	const { service } = createTestContext({
		config,
		existingDirs: ["/ws/a"],
		gitStates: { "/ws/a": { currentBranch: "main", isClean: true } },
	});

	const result = await service.run({});

	assert(result.ok);
	assertEquals(result.value.repositories.length, 1);
	assertEquals(result.value.repositories[0].path, "a");
});

Deno.test("StatusService propagates discovery errors", async () => {
	const discovery = new FakeDiscovery(Result.error(new AppError(AppErrorCode.CONFIG_NOT_FOUND, "not found")));
	const createDiscovery = (_options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort => discovery;
	const createConfigStore = (_configPath: string): ConfigStore => new FakeConfigStore("/ws/workspace.yml", { workspaces: [] });
	const fileSystem = new FakeFileSystem();
	const gitFactory = (_cwd: string): GitPort => new FakeGit({ currentBranch: "main" });
	const service = new StatusService({ createDiscovery, createConfigStore, gitFactory, fileSystem });

	const result = await service.run({});

	assert(!result.ok);
	assertEquals(result.error.code, AppErrorCode.CONFIG_NOT_FOUND);
});
