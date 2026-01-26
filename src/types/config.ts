export type PostSyncHook = {
	cmd: string[];
	description?: string;
	workDir?: string;
	timeout?: number;
	env?: Record<string, string>;
};

export type WorkspaceConfigItem = {
	url: string;
	path: string;
	branch: string;
	isGolang: boolean;
	active: boolean;
	postSyncHooks?: PostSyncHook[];
};

export type WorkspaceConfig = {
	workspaces: WorkspaceConfigItem[];
	/**
	 * Global editor for opening workspaces. Can be overridden per workspace.
	 * Falls back to $EDITOR environment variable if not set.
	 * Examples: "nvim", "code -w", "vim"
	 */
	editor?: string;
	hooks?: {
		postSyncHooks?: PostSyncHook[];
	};
};
