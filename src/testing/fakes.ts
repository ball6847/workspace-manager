import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { BranchState, GitPort, SyncBranchResult } from "../ports/git.ts";
import type { GoAvailabilityPort, GoWorkPort } from "../ports/go-work.ts";
import type { HookContext, HookExecutionResult, HookRunner } from "../ports/hook-runner.ts";
import type { DiscoveryResult, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { Confirmer } from "../ports/confirmer.ts";
import type { PostSyncHook, WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export type FakeGitState = {
	currentBranch?: string;
	isRepo?: boolean;
	isClean?: boolean;
	modifiedFiles?: number;
	untrackedFiles?: number;
	isDetached?: boolean;
	isHeadBehindBranch?: boolean;
	headSha?: string;
	syncBranchUpdated?: boolean;
	failNext?: string;
	batchInitInitializes?: string[];
};

export type FakeGitOptions = {
	cwd?: string;
	sharedStates?: Map<string, FakeGitState>;
	dirs?: Set<string>;
};

export class FakeGit implements GitPort {
	calls: { method: string; args: unknown[] }[] = [];

	constructor(
		private readonly state: FakeGitState = {},
		private readonly options: FakeGitOptions = {},
	) {}

	private record(method: string, args: unknown[]): void {
		this.calls.push({ method, args });
	}

	submoduleAdd(url: string, path: string, branch?: string): Promise<Result<void, AppError>> {
		this.record("submoduleAdd", [url, path, branch]);
		const result = this.nextResult();
		if (result.ok) {
			this.markChildInitialized(path);
		}
		return Promise.resolve(result);
	}

	submoduleRemove(path: string): Promise<Result<void, AppError>> {
		this.record("submoduleRemove", [path]);
		return Promise.resolve(this.nextResult());
	}

	submoduleInit(path: string): Promise<Result<void, AppError>> {
		this.record("submoduleInit", [path]);
		const result = this.nextResult();
		// After successful init, this path becomes a real repo
		if (result.ok) {
			this.markChildInitialized(path);
		}
		return Promise.resolve(result);
	}

	submoduleInitMany(paths: string[], jobs: number): Promise<Result<void, AppError>> {
		this.record("submoduleInitMany", [...paths, String(jobs)]);
		const result = this.nextResult();
		if (result.ok) {
			const toInitialize = this.state.batchInitInitializes ?? paths;
			for (const path of toInitialize) {
				this.markChildInitialized(path);
			}
		}
		return Promise.resolve(result);
	}

	private markChildInitialized(path: string): void {
		if (!this.options.cwd) {
			return;
		}
		const childCwd = `${this.options.cwd}/${path}`;
		if (this.options.dirs) {
			this.options.dirs.add(childCwd);
		}
		if (this.options.sharedStates) {
			const childState = this.options.sharedStates.get(childCwd) ?? {};
			childState.isRepo = true;
			this.options.sharedStates.set(childCwd, childState);
		}
	}

	checkoutBranch(branch: string): Promise<Result<void, AppError>> {
		this.record("checkoutBranch", [branch]);
		const result = this.nextResult();
		if (result.ok) {
			this.state.currentBranch = branch;
			this.state.isDetached = false;
		}
		return Promise.resolve(result);
	}

	getCurrentBranch(): Promise<Result<string, AppError>> {
		this.record("getCurrentBranch", []);
		if (this.state.failNext === "getCurrentBranch") {
			return Promise.resolve(Result.error(new AppError(AppErrorCode.GIT_FAILED, "fake getCurrentBranch failure")));
		}
		// When detached and not at tip, convention is to return "HEAD"
		return Promise.resolve(Result.ok(this.state.currentBranch ?? "main"));
	}

	isDetachedHead(): Promise<Result<boolean, AppError>> {
		this.record("isDetachedHead", []);
		return Promise.resolve(Result.ok(this.state.isDetached ?? false));
	}

	getBranchState(): Promise<Result<BranchState, AppError>> {
		this.record("getBranchState", []);
		const detached = this.state.isDetached ?? false;
		return Promise.resolve(
			Result.ok(detached ? { detached: true, branch: null } : { detached: false, branch: this.state.currentBranch ?? "main" }),
		);
	}

	isHeadBehindBranch(branch: string): Promise<Result<boolean, AppError>> {
		this.record("isHeadBehindBranch", [branch]);
		return Promise.resolve(Result.ok(this.state.isHeadBehindBranch ?? false));
	}

	getHeadSha(): Promise<Result<string, AppError>> {
		this.record("getHeadSha", []);
		return Promise.resolve(Result.ok(this.state.headSha ?? "a1b2c3d"));
	}

	pullOriginBranch(branch: string): Promise<Result<void, AppError>> {
		this.record("pullOriginBranch", [branch]);
		return Promise.resolve(this.nextResult());
	}

	syncBranch(branch: string): Promise<Result<SyncBranchResult, AppError>> {
		this.record("syncBranch", [branch]);
		if (this.state.failNext === "syncBranch") {
			this.state.failNext = undefined;
			return Promise.resolve(Result.error(new AppError(AppErrorCode.GIT_FAILED, "fake syncBranch failure")));
		}
		return Promise.resolve(Result.ok({ updated: this.state.syncBranchUpdated ?? true }));
	}

	isRepository(): Promise<Result<boolean, AppError>> {
		this.record("isRepository", []);
		const hasDir = this.options.cwd && this.options.dirs ? this.options.dirs.has(this.options.cwd) : undefined;
		return Promise.resolve(Result.ok(this.state.isRepo ?? hasDir ?? true));
	}

	isWorkingDirectoryClean(): Promise<Result<boolean, AppError>> {
		this.record("isWorkingDirectoryClean", []);
		return Promise.resolve(Result.ok(this.state.isClean ?? true));
	}

	getPorcelainStatus(): Promise<Result<{ modified: number; untracked: number }, AppError>> {
		this.record("getPorcelainStatus", []);
		return Promise.resolve(Result.ok({ modified: this.state.modifiedFiles ?? 0, untracked: this.state.untrackedFiles ?? 0 }));
	}

	stash(message?: string): Promise<Result<void, AppError>> {
		this.record("stash", [message]);
		return Promise.resolve(this.nextResult());
	}

	stashPop(): Promise<Result<void, AppError>> {
		this.record("stashPop", []);
		return Promise.resolve(this.nextResult());
	}

	fetch(): Promise<Result<void, AppError>> {
		this.record("fetch", []);
		return Promise.resolve(this.nextResult());
	}

	private nextResult(): Result<void, AppError> {
		if (this.state.failNext) {
			const method = this.state.failNext;
			this.state.failNext = undefined;
			return Result.error(new AppError(AppErrorCode.GIT_FAILED, `fake ${method} failure`));
		}
		return Result.ok();
	}
}

export class FakeConfigStore implements ConfigStore {
	configPath: string;
	config: WorkspaceConfig;
	writes: WorkspaceConfig[] = [];
	validated: string[] = [];

	constructor(configPath: string, config: WorkspaceConfig) {
		this.configPath = configPath;
		this.config = config;
	}

	getConfig(): Promise<Result<WorkspaceConfig, AppError>> {
		return Promise.resolve(Result.ok(this.config));
	}

	writeConfig(config: WorkspaceConfig): Promise<Result<void, AppError>> {
		this.writes.push(config);
		this.config = config;
		return Promise.resolve(Result.ok());
	}

	async getWorkspaceConfig(workspaceRoot: string): Promise<Result<WorkspaceConfig, AppError>> {
		const validated = await this.validateWorkspaceDir(workspaceRoot);
		if (!validated.ok) {
			return Result.error(validated.error);
		}
		return this.getConfig();
	}

	validateWorkspaceDir(workspaceRoot: string): Promise<Result<void, AppError>> {
		this.validated.push(workspaceRoot);
		return Promise.resolve(Result.ok());
	}

	getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => item.active);
	}

	getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
		return config.workspaces.filter((item) => !item.active);
	}

	enableWorkspace(workspacePath: string, config: WorkspaceConfig): Result<void, AppError> {
		const workspace = config.workspaces.find((item) => item.path === workspacePath);
		if (!workspace) {
			return Result.error(new AppError(AppErrorCode.CONFIG_INVALID, `Workspace not found at path: ${workspacePath}`));
		}
		workspace.active = true;
		return Result.ok();
	}
}

export class FakeDiscovery implements WorkspaceDiscoveryPort {
	constructor(private readonly result: Result<DiscoveryResult, AppError>) {}

	discover(): Promise<Result<DiscoveryResult, AppError>> {
		return Promise.resolve(this.result);
	}

	configExistsAt(_path: string): Promise<Result<boolean, AppError>> {
		return Promise.resolve(Result.ok(true));
	}

	getConfigFileName(): string {
		return "workspace.yml";
	}
}

export type FakeFsEntry = {
	kind: "dir" | "file" | "symlink";
	target?: string;
};

export class FakeFileSystem implements FileSystemPort {
	dirs = new Set<string>();
	entries = new Map<string, FakeFsEntry>();
	calls: { method: string; args: unknown[] }[] = [];

	constructor(entries?: Map<string, FakeFsEntry>) {
		if (entries) {
			this.entries = entries;
			// Seed dirs from entries for backward compatibility
			for (const [p, entry] of entries) {
				if (entry.kind === "dir") {
					this.dirs.add(p);
				}
			}
		}
	}

	private record(method: string, args: unknown[]): void {
		this.calls.push({ method, args });
	}

	isDir(path: string): Promise<Result<void, AppError>> {
		if (this.dirs.has(path)) {
			return Promise.resolve(Result.ok());
		}
		const entry = this.entries.get(path);
		if (entry && entry.kind === "dir") {
			return Promise.resolve(Result.ok());
		}
		return Promise.resolve(Result.error(new AppError(AppErrorCode.PATH_INVALID, `directory does not exist: ${path}`)));
	}

	isDirectoryEmpty(_path: string): Promise<Result<boolean, AppError>> {
		return Promise.resolve(Result.ok(true));
	}

	lstat(path: string): Promise<Result<{ isDirectory: boolean; isSymlink: boolean }, AppError>> {
		const entry = this.entries.get(path);
		if (!entry) {
			// Fall back to dirs set for backward compatibility
			if (this.dirs.has(path)) {
				return Promise.resolve(Result.ok({ isDirectory: true, isSymlink: false }));
			}
			return Promise.resolve(Result.error(new AppError(AppErrorCode.FS_FAILED, `lstat failed: ${path}`)));
		}
		return Promise.resolve(Result.ok({
			isDirectory: entry.kind === "dir",
			isSymlink: entry.kind === "symlink",
		}));
	}

	readLink(path: string): Promise<Result<string, AppError>> {
		const entry = this.entries.get(path);
		if (!entry || entry.kind !== "symlink") {
			return Promise.resolve(Result.error(new AppError(AppErrorCode.FS_FAILED, `not a symlink: ${path}`)));
		}
		return Promise.resolve(Result.ok(entry.target!));
	}

	createSymlink(target: string, linkPath: string): Promise<Result<void, AppError>> {
		this.record("createSymlink", [target, linkPath]);
		this.entries.set(linkPath, { kind: "symlink", target });
		return Promise.resolve(Result.ok());
	}

	remove(path: string): Promise<Result<void, AppError>> {
		this.record("remove", [path]);
		if (this.entries.has(path)) {
			this.entries.delete(path);
			this.dirs.delete(path);
			return Promise.resolve(Result.ok());
		}
		return Promise.resolve(Result.error(new AppError(AppErrorCode.FS_FAILED, `remove failed: ${path}`)));
	}

	ensureDir(path: string): Promise<Result<void, AppError>> {
		this.record("ensureDir", [path]);
		this.entries.set(path, { kind: "dir" });
		this.dirs.add(path);
		return Promise.resolve(Result.ok());
	}
}

export class FakeHookRunner implements HookRunner {
	hooks: Array<{ hook: PostSyncHook; context: HookContext }> = [];

	executeHook(hook: PostSyncHook, context: HookContext): Promise<Result<HookExecutionResult, AppError>> {
		this.hooks.push({ hook, context });
		return Promise.resolve(
			Result.ok({
				success: true,
				exitCode: 0,
				stdout: "",
				stderr: "",
				duration: 0,
			}),
		);
	}

	executeHooks(hooks: PostSyncHook[], context: HookContext): Promise<Result<HookExecutionResult[], AppError>> {
		const results: HookExecutionResult[] = [];
		for (const hook of hooks) {
			this.hooks.push({ hook, context });
			results.push({
				success: true,
				exitCode: 0,
				stdout: "",
				stderr: "",
				duration: 0,
			});
		}
		return Promise.resolve(Result.ok(results));
	}
}

export class FakeGoWork implements GoWorkPort, GoAvailabilityPort {
	calls: { method: string; args: unknown[] }[] = [];
	available = true;
	failNext: string | undefined;

	private record(method: string, args: unknown[]): void {
		this.calls.push({ method, args });
	}

	init(): Promise<Result<void, AppError>> {
		this.record("init", []);
		return Promise.resolve(Result.ok());
	}

	use(paths: string[]): Promise<Result<void, AppError>> {
		this.record("use", [paths]);
		return Promise.resolve(Result.ok());
	}

	remove(paths: string[]): Promise<Result<void, AppError>> {
		this.record("remove", [paths]);
		return Promise.resolve(Result.ok());
	}

	isAvailable(): Promise<Result<boolean, AppError>> {
		this.record("isAvailable", []);
		return Promise.resolve(Result.ok(this.available));
	}
}

export class FakeConfirmer implements Confirmer {
	answers: boolean[];
	messages: string[] = [];

	constructor(answers: boolean[]) {
		this.answers = [...answers];
	}

	confirm(message: string): Promise<Result<boolean, AppError>> {
		this.messages.push(message);
		const answer = this.answers.shift();
		if (answer === undefined) {
			return Promise.resolve(Result.error(new AppError(AppErrorCode.CANCELLED, "no more canned answers")));
		}
		return Promise.resolve(Result.ok(answer));
	}
}
