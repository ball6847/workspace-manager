import * as path from "@std/path";
import { Result } from "typescript-result";

/**
 * GitTestFixture provides helper methods for creating and managing test Git repositories
 * Uses real Git operations via Deno.Command
 */
export class GitTestFixture {
	private static readonly GIT_EXECUTABLE = "git";
	private static tempDirs: string[] = [];

	/**
	 * Create a new Git repository at the specified path
	 * TC-GIT-001: Create bare repository
	 */
	static async createRepo(repoPath: string, initialBranch: string = "main"): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Create directory
			await Deno.mkdir(repoPath, { recursive: true });

			// Initialize git repo
			const initCmd = new Deno.Command(this.GIT_EXECUTABLE, {
				args: ["init"],
				cwd: repoPath,
			});
			const initOutput = await initCmd.output();
			if (!initOutput.success) {
				throw new Error(`Git init failed: ${new TextDecoder().decode(initOutput.stderr)}`);
			}

			// Configure user
			await this.runGitCommand(repoPath, ["config", "user.email", "test@example.com"]);
			await this.runGitCommand(repoPath, ["config", "user.name", "Test User"]);

			// Create initial branch
			if (initialBranch !== "main") {
				await this.runGitCommand(repoPath, ["checkout", "-b", initialBranch]);
			}

			// Create initial commit
			const readmePath = `${repoPath}/README.md`;
			await Deno.writeTextFile(readmePath, "# Test Repository\n");
			await this.runGitCommand(repoPath, ["add", "README.md"]);
			await this.runGitCommand(repoPath, ["commit", "-m", "Initial commit"]);

			// Track this directory for cleanup
			this.tempDirs.push(repoPath);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to create repo at ${repoPath}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Create a commit in the specified repository
	 * TC-GIT-002: Create commit with files
	 */
	static async createCommit(repoPath: string, message: string, files: Record<string, string> = {}): Promise<Result<string, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Create files
			for (const [filePath, content] of Object.entries(files)) {
				const fullPath = path.join(repoPath, filePath);
				const dir = path.dirname(fullPath);
				await Deno.mkdir(dir, { recursive: true });
				await Deno.writeTextFile(fullPath, content);
			}

			// Add all files
			await this.runGitCommand(repoPath, ["add", "-A"]);

			// Commit
			await this.runGitCommand(repoPath, ["commit", "-m", message]);

			// Get commit hash
			const hashOutput = await this.runGitCommand(repoPath, ["rev-parse", "HEAD"]);
			return new TextDecoder().decode(hashOutput.stdout).trim();
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to create commit: ${result.error.message}`));
		}

		return Result.ok(result.value);
	}

	/**
	 * Create a new branch in the specified repository
	 * TC-GIT-003: Create branch from existing branch
	 */
	static async createBranch(repoPath: string, branchName: string, fromBranch: string = "main"): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Fetch the source branch
			await this.runGitCommand(repoPath, ["fetch", "origin", fromBranch]);
			// Create and checkout the new branch
			await this.runGitCommand(repoPath, ["checkout", "-b", branchName, `origin/${fromBranch}`]);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to create branch ${branchName}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Create a detached HEAD state at a specific commit
	 * TC-GIT-004: Create detached HEAD state
	 */
	static async createDetachedHead(repoPath: string, commitHash: string): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			await this.runGitCommand(repoPath, ["checkout", commitHash]);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to create detached HEAD at ${commitHash}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Setup a submodule in a parent repository
	 * TC-GIT-005: Setup submodule with branch
	 */
	static async setupSubmodule(parentPath: string, submoduleUrl: string, submodulePath: string, branch: string): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Add submodule
			await this.runGitCommand(parentPath, ["submodule", "add", "-b", branch, submoduleUrl, submodulePath]);

			// Initialize and update submodule
			await this.runGitCommand(parentPath, ["submodule", "update", "--init", "--recursive"]);

			// Commit the submodule addition
			await this.runGitCommand(parentPath, ["add", ".gitmodules", submodulePath]);
			await this.runGitCommand(parentPath, ["commit", "-m", `Add submodule ${submodulePath}`]);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to setup submodule ${submodulePath}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Cleanup temporary directories
	 * TC-GIT-006: Cleanup test repositories
	 */
	static async cleanup(repoPath: string): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Remove from tracking
			const index = this.tempDirs.indexOf(repoPath);
			if (index > -1) {
				this.tempDirs.splice(index, 1);
			}

			// Remove directory recursively
			await Deno.remove(repoPath, { recursive: true });
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to cleanup ${repoPath}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Cleanup all tracked temporary directories
	 */
	static async cleanupAll(): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			for (const dir of this.tempDirs) {
				try {
					await Deno.remove(dir, { recursive: true });
				} catch {
					// Ignore errors during cleanup
				}
			}
			this.tempDirs = [];
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to cleanup all: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Run a git command and return the output
	 */
	private static async runGitCommand(cwd: string, args: string[]): Promise<Deno.CommandOutput> {
		const cmd = new Deno.Command(this.GIT_EXECUTABLE, {
			args,
			cwd,
		});
		const output = await cmd.output();

		if (!output.success) {
			const errorMsg = new TextDecoder().decode(output.stderr).trim();
			throw new Error(`Git command failed: ${args.join(" ")}\n${errorMsg}`);
		}

		return output;
	}

	/**
	 * Get the current branch of a repository
	 */
	static async getCurrentBranch(repoPath: string): Promise<Result<string, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			const output = await this.runGitCommand(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
			return new TextDecoder().decode(output.stdout).trim();
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to get current branch: ${result.error.message}`));
		}

		return Result.ok(result.value);
	}

	/**
	 * Check if a repository has uncommitted changes
	 */
	static async hasUncommittedChanges(repoPath: string): Promise<Result<boolean, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			const output = await this.runGitCommand(repoPath, ["status", "--porcelain"]);
			const status = new TextDecoder().decode(output.stdout).trim();
			return status.length > 0;
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to check status: ${result.error.message}`));
		}

		return Result.ok(result.value);
	}

	/**
	 * Get the path to a test repository
	 */
	static getTestRepoPath(testName: string): string {
		return `/tmp/workspace-manager-test-${testName}-${Deno.pid}-${Date.now()}`;
	}

	/**
	 * Create a bare repository (for use as a remote)
	 */
	static async createBareRepo(repoPath: string): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Create directory
			await Deno.mkdir(repoPath, { recursive: true });

			// Initialize bare repo
			const initCmd = new Deno.Command(this.GIT_EXECUTABLE, {
				args: ["init", "--bare"],
				cwd: repoPath,
			});
			const initOutput = await initCmd.output();
			if (!initOutput.success) {
				throw new Error(`Git init --bare failed: ${new TextDecoder().decode(initOutput.stderr)}`);
			}

			// Track this directory for cleanup
			this.tempDirs.push(repoPath);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to create bare repo at ${repoPath}: ${result.error.message}`));
		}

		return Result.ok();
	}

	/**
	 * Clone a repository
	 */
	static async cloneRepository(sourceUrl: string, targetPath: string): Promise<Result<void, Error>> {
		const result = await Result.fromAsyncCatching(async () => {
			// Create parent directory if it doesn't exist
			const parentDir = path.dirname(targetPath);
			if (parentDir !== ".") {
				await Deno.mkdir(parentDir, { recursive: true });
			}

			// Clone repository
			const cloneCmd = new Deno.Command(this.GIT_EXECUTABLE, {
				args: ["clone", sourceUrl, targetPath],
			});
			const cloneOutput = await cloneCmd.output();
			if (!cloneOutput.success) {
				throw new Error(`Git clone failed: ${new TextDecoder().decode(cloneOutput.stderr)}`);
			}

			// Configure user in cloned repo
			await this.runGitCommand(targetPath, ["config", "user.email", "test@example.com"]);
			await this.runGitCommand(targetPath, ["config", "user.name", "Test User"]);

			// Track this directory for cleanup
			this.tempDirs.push(targetPath);
		});

		if (!result.ok) {
			return Result.error(new Error(`Failed to clone ${sourceUrl} to ${targetPath}: ${result.error.message}`));
		}

		return Result.ok();
	}
}

/**
 * Cleanup test repositories after all tests
 * Use this in Deno.test cleanup hooks
 */
export async function cleanupTestRepos(): Promise<void> {
	await GitTestFixture.cleanupAll();
}
