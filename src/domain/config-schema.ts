import { z } from "zod";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";

export const postSyncHookSchema = z.object({
	cmd: z.array(z.string()).min(1, "cmd must contain at least one element"),
	description: z.string().optional(),
	workDir: z.string().optional(),
	timeout: z.number().optional(),
	env: z.record(z.string()).optional(),
});

export const workspaceConfigItemSchema = z.object({
	url: z.string().min(1, "url is required"),
	path: z.string().min(1, "path is required"),
	branch: z.string().min(1, "branch is required"),
	isGolang: z.boolean(),
	active: z.boolean(),
	postSyncHooks: z.array(postSyncHookSchema).optional(),
});

export const workspaceConfigSchema = z.object({
	workspaces: z.array(workspaceConfigItemSchema),
	editor: z.string().optional(),
	hooks: z.object({
		postSyncHooks: z.array(postSyncHookSchema).optional(),
	}).optional(),
});

export type PostSyncHook = z.infer<typeof postSyncHookSchema>;
export type WorkspaceConfigItem = z.infer<typeof workspaceConfigItemSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

type IssueSummary = {
	path: string;
	message: string;
};

function summarizeZodIssues(issues: z.ZodIssue[]): IssueSummary[] {
	return issues.map((issue) => {
		const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
		return { path, message: issue.message };
	});
}

export function parseWorkspaceConfig(raw: unknown): Result<WorkspaceConfig, AppError> {
	const result = workspaceConfigSchema.safeParse(raw);

	if (!result.success) {
		const issues = summarizeZodIssues(result.error.issues);
		return Result.error(
			new AppError(AppErrorCode.CONFIG_INVALID, "Invalid workspace configuration", {
				context: { issues },
			}),
		);
	}

	return Result.ok(result.data);
}
