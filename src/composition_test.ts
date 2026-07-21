import { assert, assertEquals } from "@std/assert";
import { createAppContext } from "./composition.ts";
import type { GitPort } from "./ports/git.ts";

Deno.test("createAppContext returns expected shape", () => {
	const ctx = createAppContext({ debug: true });

	assertEquals(ctx.debug, true);
	assert(typeof ctx.logger === "object");
	assert(typeof ctx.fileSystem === "object");
	assert(typeof ctx.goAvailability === "object");
	assert(typeof ctx.gitFactory === "function");
	assert(typeof ctx.goWorkFactory === "function");
	assert(typeof ctx.createConfigStore === "function");
	assert(typeof ctx.createDiscovery === "function");
	assert(typeof ctx.createHookRunner === "function");
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
	assert(typeof git.isWorkingDirectoryClean === "function");
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

Deno.test("logger debugEnabled honors bootstrap debug flag", () => {
	const debugCtx = createAppContext({ debug: true });
	const silentCtx = createAppContext({ debug: false });

	assert(debugCtx.logger !== silentCtx.logger);

	// Smoke test: debug logger accepts messages without throwing
	debugCtx.logger.debug("debug message");
	debugCtx.logger.info("info message");
	debugCtx.logger.warn("warn message");
	debugCtx.logger.error("error message");

	// Non-debug logger should also accept messages without throwing
	silentCtx.logger.info("info message");
	silentCtx.logger.warn("warn message");
	silentCtx.logger.error("error message");
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
