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
import { AddService } from "./services/add-service.ts";
import { EnableService } from "./services/enable-service.ts";
import { OpenService } from "./services/open-service.ts";
import { SaveService } from "./services/save-service.ts";
import { StatusService } from "./services/status-service.ts";
import { SyncService } from "./services/sync-service.ts";
import { UpdateService } from "./services/update-service.ts";

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
	statusService: StatusService;
	saveService: SaveService;
	updateService: UpdateService;
	syncService: SyncService;
	addService: AddService;
	enableService: EnableService;
	openService: OpenService;
};

export function createAppContext(options?: BootstrapOptions): AppContext {
	const debug = options?.debug ?? false;
	const startDir = options?.startDir;

	const logger = new ConsoleLogger(debug);
	const fileSystem = new DenoFileSystem();
	const goAvailability = new GoWork();

	const createConfigStore = (configPath: string) => new ConfigManager(configPath);
	const createDiscovery = (opts: WorkspaceDiscoveryOptions) => new WorkspaceDiscovery({ ...opts, startDir: opts.startDir ?? startDir });
	const createHookRunner = (hookDebug?: boolean) => new HookExecutor(hookDebug ?? debug);
	const gitFactory: GitPortFactory = (cwd: string) => new GitManager(cwd);
	const goWorkFactory: GoWorkPortFactory = (cwd: string) => new GoWork(cwd);

	const statusService = new StatusService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		fileSystem,
		logger,
	});

	const saveService = new SaveService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		fileSystem,
		logger,
	});

	const updateService = new UpdateService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		fileSystem,
		logger,
	});

	const syncService = new SyncService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		goWorkFactory,
		fileSystem,
		createHookRunner,
		logger,
	});

	const addService = new AddService({
		createDiscovery,
		createConfigStore,
		logger,
	});

	const enableService = new EnableService({
		createDiscovery,
		createConfigStore,
		logger,
	});

	const openService = new OpenService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		goWorkFactory,
		fileSystem,
		createHookRunner,
		logger,
	});

	return {
		debug,
		logger,
		fileSystem,
		goAvailability,
		gitFactory,
		goWorkFactory,
		createConfigStore,
		createDiscovery,
		createHookRunner,
		statusService,
		saveService,
		updateService,
		syncService,
		addService,
		enableService,
		openService,
	};
}
