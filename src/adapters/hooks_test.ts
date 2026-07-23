import { assert, assertEquals } from "@std/assert";
import { HookExecutor } from "./hooks.ts";
import type { PostSyncHook } from "../types/config.ts";
import type { HookContext } from "../ports/hook-runner.ts";

class ConsoleCapture {
	logs: string[] = [];

	attach(): () => void {
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			this.logs.push(args.join(" "));
		};
		return () => {
			console.log = originalLog;
		};
	}
}

function makeCtx(): HookContext {
	return { root: Deno.cwd(), path: Deno.cwd() };
}

Deno.test("HookExecutor: success returns Result.ok with success=true and exitCode=0", async () => {
	const executor = new HookExecutor(false);

	const hook: PostSyncHook = { cmd: ["deno", "eval", "Deno.exit(0)"] };

	const result = await executor.executeHook(hook, makeCtx());

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.success, true);
	assertEquals(result.value.exitCode, 0);
});

Deno.test("HookExecutor: non-zero exit returns Result.ok with success=false", async () => {
	const executor = new HookExecutor(false);

	const hook: PostSyncHook = { cmd: ["deno", "eval", "Deno.exit(1)"] };

	const result = await executor.executeHook(hook, makeCtx());

	// HookExecutor returns ok wrapper with success=false for non-zero exits (not an error Result)
	assert(result.ok, `expected ok result wrapper, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.success, false);
	assertEquals(result.value.exitCode, 1);
});

Deno.test("HookExecutor: executeHooks runs all hooks and returns results", async () => {
	const executor = new HookExecutor(false);

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

Deno.test("HookExecutor: debug=true prints workDir and duration/stdout", async () => {
	const executor = new HookExecutor(true);
	const capture = new ConsoleCapture();
	const restore = capture.attach();

	try {
		const hook: PostSyncHook = { cmd: ["deno", "eval", "console.log('hello from hook')"] };
		const result = await executor.executeHook(hook, makeCtx());

		assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
		// Debug output should include workDir and duration
		const allOutput = capture.logs.join("\n");
		assertEquals(allOutput.includes("workDir:"), true, "debug output should include workDir");
		assertEquals(allOutput.includes("Hook completed in"), true, "debug output should include duration");
		assertEquals(allOutput.includes("stdout:"), true, "debug output should include stdout");
	} finally {
		restore();
	}
});

Deno.test("HookExecutor: debug=false omits workDir and duration/stdout", async () => {
	const executor = new HookExecutor(false);
	const capture = new ConsoleCapture();
	const restore = capture.attach();

	try {
		const hook: PostSyncHook = { cmd: ["deno", "eval", "console.log('hello from hook')"] };
		const result = await executor.executeHook(hook, makeCtx());

		assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
		const allOutput = capture.logs.join("\n");
		assertEquals(allOutput.includes("workDir:"), false, "non-debug output should not include workDir");
		assertEquals(allOutput.includes("Hook completed in"), false, "non-debug output should not include duration");
		assertEquals(allOutput.includes("stdout:"), false, "non-debug output should not include stdout dump");
	} finally {
		restore();
	}
});
