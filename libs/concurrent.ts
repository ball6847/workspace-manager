import { Result } from "typescript-result";

/**
 * Process items concurrently with a specified concurrency limit
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations (default: 2)
 * @returns Result indicating success or failure
 */
export async function processConcurrently<T, E extends Error>(
	items: T[],
	processor: (item: T) => Promise<Result<void, E>>,
	concurrency: number = 2,
): Promise<Result<void, E>> {
	if (items.length === 0) {
		return Result.ok();
	}

	// Create batches based on concurrency level
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		batches.push(items.slice(i, i + concurrency));
	}

	// Process each batch concurrently
	for (const batch of batches) {
		const promises = batch.map((item) => processor(item));
		const results = await Promise.all(promises);

		// Check if any operation failed
		for (const result of results) {
			if (!result.ok) {
				return result as Result<void, E>;
			}
		}
	}

	return Result.ok();
}

/**
 * Process items concurrently with a specified concurrency limit, allowing some failures
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param concurrency - Maximum number of concurrent operations (default: 2)
 * @returns Array of results for each item
 */
export async function processConcurrentlyWithResults<T, R, E extends Error>(
	items: T[],
	processor: (item: T) => Promise<Result<R, E>>,
	concurrency: number = 2,
): Promise<Result<R, E>[]> {
	if (items.length === 0) {
		return [];
	}

	// Create batches based on concurrency level
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		batches.push(items.slice(i, i + concurrency));
	}

	const allResults: Result<R, E>[] = [];

	// Process each batch concurrently
	for (const batch of batches) {
		const promises = batch.map((item) => processor(item));
		const results = await Promise.all(promises);
		allResults.push(...results);
	}

	return allResults;
}
