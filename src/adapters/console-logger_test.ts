import { assertEquals } from "@std/assert";
import { ConsoleLogger } from "./console-logger.ts";

class ConsoleCapture {
	logs: unknown[] = [];
	warns: unknown[] = [];
	errors: unknown[] = [];

	attach(): () => void {
		const originalLog = console.log;
		const originalWarn = console.warn;
		const originalError = console.error;

		console.log = (...args: unknown[]) => {
			this.logs.push(args.join(" "));
		};
		console.warn = (...args: unknown[]) => {
			this.warns.push(args.join(" "));
		};
		console.error = (...args: unknown[]) => {
			this.errors.push(args.join(" "));
		};

		return () => {
			console.log = originalLog;
			console.warn = originalWarn;
			console.error = originalError;
		};
	}
}

Deno.test("ConsoleLogger suppresses debug messages when debug is disabled", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const logger = new ConsoleLogger(false);
		logger.debug("should be silent");
		assertEquals(capture.logs.length, 0);
	} finally {
		restore();
	}
});

Deno.test("ConsoleLogger prints debug messages when debug is enabled", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const logger = new ConsoleLogger(true);
		logger.debug("hello debug");
		assertEquals(capture.logs.length, 1);
		assertEquals(capture.logs[0], "[DEBUG] hello debug");
	} finally {
		restore();
	}
});

Deno.test("ConsoleLogger formats fields as key=value pairs", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const logger = new ConsoleLogger(false);
		logger.info("message", { path: "services/a", count: 2, nested: { x: 1 } });
		assertEquals(capture.logs.length, 1);
		assertEquals(capture.logs[0], '[INFO] message path=services/a count=2 nested={"x":1}');
	} finally {
		restore();
	}
});

Deno.test("ConsoleLogger skips empty fields", () => {
	const capture = new ConsoleCapture();
	const restore = capture.attach();
	try {
		const logger = new ConsoleLogger(false);
		logger.info("plain");
		logger.info("empty fields", {});
		assertEquals(capture.logs.length, 2);
		assertEquals(capture.logs[0], "[INFO] plain");
		assertEquals(capture.logs[1], "[INFO] empty fields");
	} finally {
		restore();
	}
});
