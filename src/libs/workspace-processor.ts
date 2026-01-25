import { Result } from "typescript-result";
import { processConcurrently, processConcurrentlyWithResults } from "./concurrent.ts";

export class WorkspaceProcessor {
	constructor(private readonly concurrency: number = 4) {}

	async processConcurrently<T, E extends Error>(items: T[], processor: (item: T) => Promise<Result<void, E>>): Promise<Result<void, E>> {
		return await processConcurrently(items, processor, this.concurrency);
	}

	async processConcurrentlyWithResults<T, R, E extends Error>(items: T[], processor: (item: T) => Promise<Result<R, E>>): Promise<Result<R, E>[]> {
		return await processConcurrentlyWithResults(items, processor, this.concurrency);
	}
}
