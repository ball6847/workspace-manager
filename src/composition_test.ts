import { assert, assertEquals } from "@std/assert";
import { createAppContext } from "./composition.ts";
import type { GitPort } from "./ports/git.ts";

Deno.test("createAppContext returns expected shape", () => {
	const ctx = createAppContext({ debug: true });

	assertEquals(ctx.debug, true);
	assert(typeof ctx.fileSystem === "object");
	assert(typeof ctx.goAvailability === "object");
	assert(typeof ctx.gitFactory === "function");
	assert(typeof ctx.goWorkFactory === "function");
	assert(typeof ctx.createConfigStore === "function");
	assert(typeof ctx.createDiscovery === "function");
	assert(typeof ctx.createHookRunner === "function");
});

Deno.test("createAppContext exposes all use-case services", () => {
	const ctx = createAppContext();

	assert(ctx.statusService instanceof Object);
	assert(typeof ctx.statusService.run === "function");

	assert(ctx.saveService instanceof Object);
	assert(typeof ctx.saveService.run === "function");

	assert(ctx.updateService instanceof Object);
	assert(typeof ctx.updateService.run === "function");

	assert(ctx.syncService instanceof Object);
	assert(typeof ctx.syncService.run === "function");

	assert(ctx.addService instanceof Object);
	assert(typeof ctx.addService.add === "function");

	assert(ctx.enableService instanceof Object);
	assert(typeof ctx.enableService.enablePaths === "function");

	assert(ctx.openService instanceof Object);
	assert(typeof ctx.openService.listWorkspaces === "function");
	assert(typeof ctx.openService.prepareWorkspace === "function");

	assert(ctx.linkService instanceof Object);
	assert(typeof ctx.linkService.run === "function");
});

Deno.test("gitFactory returns an object assignable to GitPort", () => {
	const ctx = createAppContext();
	const git = ctx.gitFactory("/tmp");

	assert(typeof git.submoduleAdd === "function");
	assert(typeof git.submoduleRemove === "function");
	assert(typeof git.checkoutBranch === "function");
	assert(typeof git.getCurrentBranch === "function");
	assert(typeof git.pullOriginBranch === "function");
	assert(typeof git.isRepository === "function");
	assert(typeof git.isDetachedHead === "function");
	assert(typeof git.isHeadBehindBranch === "function");
	assert(typeof git.isWorkingDirectoryClean === "function");
	assert(typeof git.getPorcelainStatus === "function");
	assert(typeof git.stash === "function");
	assert(typeof git.stashPop === "function");
	assert(typeof git.fetch === "function");

	// Type-only compile check: the returned object should be assignable to GitPort
	const _port: GitPort = git;
	assert(_port === git);
});

Deno.test("createConfigStore returns a store with configPath", () => {
	const ctx = createAppContext();
	const store = ctx.createConfigStore("/tmp/workspace.yml");

	assertEquals(store.configPath, "/tmp/workspace.yml");
	assert(typeof store.getConfig === "function");
	assert(typeof store.writeConfig === "function");
});

Deno.test("createDiscovery forwards startDir from bootstrap options", () => {
	const ctx = createAppContext({ startDir: "/custom/start" });
	const discovery = ctx.createDiscovery({});

	assert(typeof discovery.discover === "function");
	assert(typeof discovery.configExistsAt === "function");
	assert(typeof discovery.getConfigFileName === "function");
});

Deno.test("createHookRunner returns a runner with executeHooks", () => {
	const ctx = createAppContext({ debug: true });
	const runner = ctx.createHookRunner();

	assert(typeof runner.executeHook === "function");
	assert(typeof runner.executeHooks === "function");
});
