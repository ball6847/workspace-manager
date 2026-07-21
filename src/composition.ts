import { ConfigManager } from "./adapters/config-store.ts";
import { ConsoleLogger } from "./adapters/console-logger.ts";
import { DenoFileSystem } from "./adapters/file-system.ts";
import { GitManager } from "./adapters/git.ts";
import { GoWork } from "./adapters/go-work.ts";
import { HookExecutor } from "./adapters/hooks.ts";
import { WorkspaceDiscovery } from "./adapters/workspace-discovery.ts";
import type { ConfigStore } from "./ports/config-store.ts";
import type { FileSystemPort } from "./ports/file-system.ts";
import type { GitPortFactory } from "./ports/git.ts";
import type { GoAvailabilityPort, GoWorkPortFactory } from "./ports/go-work.ts";
import type { HookRunner } from "./ports/hook-runner.ts";
import type { Logger } from "./ports/logger.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "./ports/workspace-discovery.ts";

export type BootstrapOptions = {
	debug?: boolean;
	/** Optional override for tests */
	startDir?: string;
};

export type AppContext = {
	debug: boolean;
	logger: Logger;
	fileSystem: FileSystemPort;
	goAvailability: GoAvailabilityPort;
	gitFactory: GitPortFactory;
	goWorkFactory: GoWorkPortFactory;
	createConfigStore: (configPath: string) => ConfigStore;
	createDiscovery: (options: WorkspaceDiscoveryOptions) => WorkspaceDiscoveryPort;
	createHookRunner: (debug?: boolean) => HookRunner;
};

export function createAppContext(options?: BootstrapOptions): AppContext {
	const debug = options?.debug ?? false;
	const startDir = options?.startDir;

	const logger = new ConsoleLogger(debug);
	const fileSystem = new DenoFileSystem();
	const goAvailability = new GoWork();

	return {
		debug,
		logger,
		fileSystem,
		goAvailability,
		gitFactory: (cwd: string) => new GitManager(cwd),
		goWorkFactory: (cwd: string) => new GoWork(cwd),
		createConfigStore: (configPath: string) => new ConfigManager(configPath),
		createDiscovery: (opts: WorkspaceDiscoveryOptions) => new WorkspaceDiscovery({ ...opts, startDir: opts.startDir ?? startDir }),
		createHookRunner: (hookDebug?: boolean) => new HookExecutor(hookDebug ?? debug),
	};
}
