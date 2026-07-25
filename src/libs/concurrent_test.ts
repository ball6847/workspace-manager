import { assert, assertEquals, assertFalse } from "@std/assert";
import { Result } from "typescript-result";
import { processConcurrently, processConcurrentlyWithResults } from "./concurrent.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test("processConcurrentlyWithResults: concurrency limit is never exceeded", async () => {
	const items = Array.from({ length: 20 }, (_, i) => i);
	let active = 0;
	let maxActive = 0;

	const results = await processConcurrentlyWithResults(
		items,
		async (item) => {
			active++;
			if (active > maxActive) {
				maxActive = active;
			}
			await sleep(10);
			active--;
			return Result.ok(item);
		},
		5,
	);

	assertEquals(results.length, 20);
	for (let i = 0; i < results.length; i++) {
		assert(results[i].ok, `expected result ${i} to be ok`);
		assertEquals(results[i].value, i);
	}
	assertEquals(maxActive, 5, `max active concurrency should be 5, got ${maxActive}`);
});

Deno.test("processConcurrentlyWithResults: results preserve input order", async () => {
	const items = Array.from({ length: 10 }, (_, i) => i);

	const results = await processConcurrentlyWithResults(
		items,
		async (item) => {
			await sleep(item % 2 === 0 ? 20 : 5);
			return Result.ok(item);
		},
		4,
	);

	assertEquals(results.length, 10);
	for (let i = 0; i < results.length; i++) {
		assert(results[i].ok, `expected result ${i} to be ok`);
		assertEquals(results[i].value, i);
	}
});

Deno.test("processConcurrentlyWithResults: slow item does not convoy later fast items", async () => {
	// Item durations: one slow (index 0, 400ms) and four fast (10ms each).
	// Concurrency 2 means the second slot should drain fast items while the
	// slow item occupies the first slot.
	const items = [
		{ duration: 400, index: 0 },
		{ duration: 10, index: 1 },
		{ duration: 10, index: 2 },
		{ duration: 10, index: 3 },
		{ duration: 10, index: 4 },
	];
	const startTimes: number[] = new Array(items.length);
	const start = performance.now();

	const results = await processConcurrentlyWithResults(
		items,
		async (item) => {
			startTimes[item.index] = performance.now() - start;
			await sleep(item.duration);
			return Result.ok(item.index);
		},
		2,
	);

	const elapsed = performance.now() - start;

	assertEquals(results.length, items.length);
	for (const result of results) {
		assert(result.ok);
	}

	// Wall time should be dominated by the slow item, not by batch stalls.
	assert(elapsed < 500, `expected elapsed < 500ms, got ${elapsed}ms`);

	// All fast items should start before the slow item finishes.
	for (let i = 1; i < startTimes.length; i++) {
		assert(startTimes[i] < 400, `expected fast item ${i} to start before slow item finished, started at ${startTimes[i]}ms`);
	}
});

Deno.test("processConcurrently: returns first error and stops starting new items", async () => {
	const processed: number[] = [];

	// Make the failing item finish first so the failure is observed while the
	// first item is still in flight. This keeps the test deterministic: items
	// after the failure that had not started must never be processed.
	const items = [
		{ label: "ok-slow", duration: 50, index: 0 },
		{ label: "fail-fast", duration: 10, index: 1 },
		{ label: "ok-2", duration: 20, index: 2 },
		{ label: "ok-3", duration: 20, index: 3 },
		{ label: "ok-4", duration: 20, index: 4 },
	];

	const result = await processConcurrently(
		items,
		async (item) => {
			processed.push(item.index);
			await sleep(item.duration);
			if (item.label === "fail-fast") {
				return Result.error(new Error("intentional failure"));
			}
			return Result.ok();
		},
		2,
	);

	assertFalse(result.ok, "expected an error result");
	assertEquals(result.error.message, "intentional failure");

	// Items 0 and 1 started immediately. Once item 1 failed, no further items
	// should have been picked up.
	assert(processed.includes(0), "expected item 0 to have started");
	assert(processed.includes(1), "expected item 1 to have started");
	for (let i = 2; i <= 4; i++) {
		assertFalse(processed.includes(i), `expected item ${i} to never start`);
	}
});

Deno.test("processConcurrently: empty input returns ok", async () => {
	const result = await processConcurrently<number, Error>([], () => Promise.resolve(Result.ok()), 3);
	assert(result.ok);
});

Deno.test("processConcurrentlyWithResults: empty input returns empty array", async () => {
	const results = await processConcurrentlyWithResults<number, number, Error>([], () => Promise.resolve(Result.ok(0)), 3);
	assertEquals(results, []);
});

Deno.test("processConcurrently: first error is returned among multiple failures", async () => {
	const result = await processConcurrently(
		["a", "b", "c"],
		async (item) => {
			await sleep(5);
			return Result.error(new Error(`failed: ${item}`));
		},
		2,
	);

	assertFalse(result.ok);
	assertEquals(result.error.message, "failed: a");
});

Deno.test("processConcurrentlyWithResults: collects all results including failures", async () => {
	const results = await processConcurrentlyWithResults(
		["a", "b", "c"],
		async (item) => {
			await sleep(5);
			if (item === "b") {
				return Result.error(new Error(`failed: ${item}`));
			}
			return Result.ok(item);
		},
		2,
	);

	assertEquals(results.length, 3);
	assert(results[0].ok);
	assertEquals(results[0].value, "a");
	assertFalse(results[1].ok);
	assertEquals(results[1].error.message, "failed: b");
	assert(results[2].ok);
	assertEquals(results[2].value, "c");
});
