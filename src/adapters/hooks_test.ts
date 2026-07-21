import { assert, assertEquals } from "@std/assert";
import { HookExecutor } from "./hooks.ts";
import { FakeLogger } from "../testing/fakes.ts";
import type { PostSyncHook } from "../types/config.ts";
import type { HookContext } from "../ports/hook-runner.ts";

function makeCtx(): HookContext {
	return { root: Deno.cwd(), path: Deno.cwd() };
}

Deno.test("HookExecutor: success returns Result.ok with success=true and exitCode=0", async () => {
	const logger = new FakeLogger();
	const executor = new HookExecutor(logger, false);

	const hook: PostSyncHook = { cmd: ["deno", "eval", "Deno.exit(0)"] };

	const result = await executor.executeHook(hook, makeCtx());

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.success, true);
	assertEquals(result.value.exitCode, 0);
});

Deno.test("HookExecutor: non-zero exit returns Result.ok with success=false", async () => {
	const logger = new FakeLogger();
	const executor = new HookExecutor(logger, false);

	const hook: PostSyncHook = { cmd: ["deno", "eval", "Deno.exit(1)"] };

	const result = await executor.executeHook(hook, makeCtx());

	// HookExecutor returns ok wrapper with success=false for non-zero exits (not an error Result)
	assert(result.ok, `expected ok result wrapper, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.success, false);
	assertEquals(result.value.exitCode, 1);
});

Deno.test("HookExecutor: executeHooks runs all hooks and returns results", async () => {
	const logger = new FakeLogger();
	const executor = new HookExecutor(logger, false);

	const hooks: PostSyncHook[] = [
		{ cmd: ["deno", "eval", "Deno.exit(0)"] },
		{ cmd: ["deno", "eval", "Deno.exit(0)"] },
	];

	const result = await executor.executeHooks(hooks, makeCtx());

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.length, 2);
	assertEquals(result.value[0].success, true);
	assertEquals(result.value[1].success, true);
});
