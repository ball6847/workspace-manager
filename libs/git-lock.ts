/**
 * Simple async mutex implementation
 */
class AsyncMutex {
	private queue: Array<() => void> = [];
	private locked = false;

	/**
	 * Acquire the mutex, waiting if necessary
	 * @returns Release function to call when done
	 */
	async acquire(): Promise<() => void> {
		return new Promise((resolve) => {
			if (!this.locked) {
				this.locked = true;
				resolve(() => this.release());
			} else {
				this.queue.push(() => resolve(() => this.release()));
			}
		});
	}

	/**
	 * Acquire the mutex with timeout
	 * @param timeoutMs - Timeout in milliseconds
	 * @returns Release function or throws timeout error
	 */
	async acquireWithTimeout(timeoutMs: number): Promise<() => void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Mutex acquisition timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			if (!this.locked) {
				clearTimeout(timeout);
				this.locked = true;
				resolve(() => this.release());
			} else {
				this.queue.push(() => {
					clearTimeout(timeout);
					resolve(() => this.release());
				});
			}
		});
	}

	private release() {
		const next = this.queue.shift();
		if (next) {
			next();
		} else {
			this.locked = false;
		}
	}
}

/**
 * Git operation lock using Async Mutex
 * Ensures only one git operation runs at a time within the same process
 */
export class GitLock {
	private static mutex = new AsyncMutex();

	/**
	 * Execute a git operation with exclusive lock
	 * @param _repoPath - Path to the git repository (for future cross-repo locking)
	 * @param operation - Async function to execute
	 * @returns Result of the operation
	 */
	static async withLock<T>(
		_repoPath: string,
		operation: () => Promise<T>,
	): Promise<T> {
		// For now, we use a single mutex for all git operations
		// In the future, this could be enhanced to use per-repo mutexes
		const release = await this.mutex.acquire();
		try {
			return await operation();
		} finally {
			release();
		}
	}

	/**
	 * Execute a git operation with exclusive lock and timeout
	 * @param _repoPath - Path to the git repository
	 * @param operation - Async function to execute
	 * @param timeoutMs - Timeout in milliseconds (default: 30000)
	 * @returns Result of the operation or throws timeout error
	 */
	static async withLockAndTimeout<T>(
		_repoPath: string,
		operation: () => Promise<T>,
		timeoutMs: number = 30000,
	): Promise<T> {
		const release = await this.mutex.acquireWithTimeout(timeoutMs);
		try {
			return await operation();
		} finally {
			release();
		}
	}
}
