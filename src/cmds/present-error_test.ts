import { assertEquals } from "@std/assert";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { presentCommandError } from "./present-error.ts";

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

Deno.test("presentCommandError prints code for AppError", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		presentCommandError("Sync", new AppError(AppErrorCode.GIT_FAILED, "clone failed"));
		assertEquals(capture.logs.length, 1);
		assertEquals(capture.logs[0].includes("[GIT_FAILED]"), true);
		assertEquals(capture.logs[0].includes("clone failed"), true);
	} finally {
		restore();
	}
});

Deno.test("presentCommandError prints context and cause chain in debug mode", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const cause = new Error("network timeout");
		const error = new AppError(AppErrorCode.HOOK_FAILED, "hook crashed", { cause, context: { cmd: "lint" } });
		presentCommandError("Sync", error, { debug: true });
		assertEquals(capture.logs.length, 3);
		assertEquals(capture.logs[0].includes("hook crashed"), true);
		assertEquals(capture.logs[1].includes('"cmd": "lint"'), true);
		assertEquals(capture.logs[2].includes("network timeout"), true);
	} finally {
		restore();
	}
});

Deno.test("presentCommandError skips debug output when debug is false", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const error = new AppError(AppErrorCode.HOOK_FAILED, "hook crashed", { context: { cmd: "lint" } });
		presentCommandError("Sync", error, { debug: false });
		assertEquals(capture.logs.length, 1);
	} finally {
		restore();
	}
});
