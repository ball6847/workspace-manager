import { Result } from "typescript-result";

/**
 * Process items concurrently with a specified concurrency limit.
 *
 * Workers share an index cursor into the input array; as soon as any worker
 * finishes an item it picks up the next available one. When an item fails, no
 * new items are started (in-flight items are allowed to finish) and the first
 * error by input index is returned.
 *
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations (default: 8)
 * @returns Result indicating success or failure
 */
export async function processConcurrently<T, E extends Error>(
	items: T[],
	processor: (item: T) => Promise<Result<void, E>>,
	concurrency: number = 8,
): Promise<Result<void, E>> {
	if (items.length === 0) {
		return Result.ok();
	}

	const results: Result<void, E>[] = new Array(items.length);
	let nextIndex = 0;
	let failed = false;

	async function worker(): Promise<void> {
		while (nextIndex < items.length && !failed) {
			const index = nextIndex++;
			const result = await processor(items[index]);
			results[index] = result;
			if (!result.ok) {
				failed = true;
			}
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
	await Promise.all(workers);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result && !result.ok) {
			return result as Result<void, E>;
		}
	}

	return Result.ok();
}

/**
 * Process items concurrently with a specified concurrency limit, allowing some failures.
 *
 * Workers share an index cursor into the input array and write results back by
 * input index, so the returned array is in the same order as the input.
 *
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations (default: 8)
 * @returns Array of results for each item
 */
export async function processConcurrentlyWithResults<T, R, E extends Error>(
	items: T[],
	processor: (item: T) => Promise<Result<R, E>>,
	concurrency: number = 8,
): Promise<Result<R, E>[]> {
	if (items.length === 0) {
		return [];
	}

	const results: Result<R, E>[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			results[index] = await processor(items[index]);
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
	await Promise.all(workers);

	return results;
}
