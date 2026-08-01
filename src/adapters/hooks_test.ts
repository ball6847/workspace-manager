import { assert, assertEquals } from "@std/assert";
import { AppErrorCode } from "../libs/app-error.ts";
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

Deno.test("HookExecutor: debug=true prints workDir and duration (no captured output dump)", async () => {
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
		assertEquals(allOutput.includes("stdout:"), false, "debug output must not dump captured stdout");
		assertEquals(allOutput.includes("stderr:"), false, "debug output must not dump captured stderr");
	} finally {
		restore();
	}
});

Deno.test("HookExecutor: debug=false omits workDir and duration", async () => {
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

Deno.test("HookExecutor: hook output is not captured by the executor (inherited stdio)", async () => {
	const executor = new HookExecutor(false);
	const capture = new ConsoleCapture();
	const restore = capture.attach();

	try {
		// The marker is built at runtime inside the child so it never appears in the echoed command line.
		const hook: PostSyncHook = { cmd: ["deno", "eval", "console.log('hook' + '_out'); console.error('hook' + '_err')"] };
		const result = await executor.executeHook(hook, makeCtx());

		assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
		// Output streams live to the terminal; nothing is captured into console.log
		const allOutput = capture.logs.join("\n");
		assertEquals(allOutput.includes("hook_out"), false, "hook stdout must not be captured into executor logs");
		assertEquals(allOutput.includes("hook_err"), false, "hook stderr must not be captured into executor logs");
	} finally {
		restore();
	}
});

Deno.test("HookExecutor: hook reading stdin completes without hanging (stdin inherited)", async () => {
	const executor = new HookExecutor(false);

	// Reads stdin with a guard so the child never hangs in a non-interactive test run.
	const script = "const readP = Deno.stdin.read(new Uint8Array(8));" +
		"const guardP = new Promise((r) => setTimeout(() => r('guard'), 1500));" +
		"const out = await Promise.race([readP, guardP]);" +
		"console.log('stdin-result', out === 'guard' ? 'blocked' : out === null ? 'eof' : 'data');" +
		"Deno.exit(0)";
	const hook: PostSyncHook = { cmd: ["deno", "eval", script], timeout: 10000 };

	const result = await executor.executeHook(hook, makeCtx());

	assert(result.ok, `expected ok, got: ${JSON.stringify(result.error)}`);
	assertEquals(result.value.success, true);
});

Deno.test("HookExecutor: timeout kills the child and returns HOOK_FAILED", async () => {
	const executor = new HookExecutor(false);

	const hook: PostSyncHook = {
		cmd: ["deno", "eval", "await new Promise((r) => setTimeout(r, 3000))"],
		timeout: 200,
	};

	const result = await executor.executeHook(hook, makeCtx());

	assert(!result.ok, "expected error result on timeout");
	assertEquals(result.error.code, AppErrorCode.HOOK_FAILED);
	assert(result.error.message.includes("timed out"), `expected timeout message, got: ${result.error.message}`);
});
