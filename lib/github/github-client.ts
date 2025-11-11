import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/utils/token-encryption";

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
}

export interface RepositoryDetails extends Repository {
  watchers_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string;
  html_url: string;
  clone_url: string;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  sha: string;
  url: string;
}

export interface FileContent {
  name: string;
  path: string;
  content: string;
  encoding: "base64";
  size: number;
  sha: string;
}

export class GitHubClient {
  private userId: string;
  private accessToken: string | null = null;
  private accountId: string | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initialize client by loading account and tokens
   */
  async initialize(): Promise<void> {
    const account = await prisma.gitHubAccount.findFirst({
      where: {
        userId: this.userId,
        status: "ACTIVE",
      },
    });

    if (!account) {
      throw new Error("No active GitHub account found");
    }

    this.accountId = account.id;

    // Check if token needs refresh
    if (account.expiresAt && account.expiresAt < new Date()) {
      await this.refreshToken();
    } else {
      this.accessToken = decryptToken(account.accessTokenEnc);
    }
  }

  /**
   * Refresh access token (if refresh token available)
   * Note: GitHub doesn't always provide refresh tokens
   */
  private async refreshToken(): Promise<void> {
    const account = await prisma.gitHubAccount.findFirst({
      where: {
        userId: this.userId,
        status: "ACTIVE",
      },
    });

    if (!account) {
      throw new Error("No active GitHub account found");
    }

    // GitHub tokens typically don't expire, but if they do and we have a refresh token
    if (account.refreshTokenEnc) {
      // TODO: Implement refresh token flow if GitHub provides refresh tokens
      // For now, throw error to prompt re-authentication
      throw new Error("Token expired. Please reconnect your GitHub account.");
    } else {
      throw new Error("Token expired. Please reconnect your GitHub account.");
    }
  }

  /**
   * Make authenticated request to GitHub API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.accessToken) {
      await this.initialize();
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "OperaStudio/1.0",
      },
    });

    if (response.status === 401) {
      // Token expired or invalid
      throw new Error("GitHub token expired. Please reconnect your account.");
    }

    if (response.status === 404) {
      // Repository not found or access denied
      const error = await response.json().catch(() => ({
        message: "Repository not found or you don't have access to it",
      }));
      // GitHub API returns 404 for both non-existent repos and repos without access
      const errorMessage = error.message || "Repository not found or you don't have access to it";
      throw new Error(errorMessage);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: `GitHub API error: ${response.statusText}`,
      }));
      throw new Error(error.message || `GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get authenticated user info
   */
  async getUser(): Promise<{ login: string; name?: string; email?: string }> {
    return this.request("/user");
  }

  /**
   * List repositories
   */
  async listRepos(options?: {
    type?: "all" | "owner" | "member";
    sort?: "created" | "updated" | "pushed" | "full_name";
    direction?: "asc" | "desc";
    per_page?: number;
    page?: number;
  }): Promise<Repository[]> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/user/repos${query ? `?${query}` : ""}`);
  }

  /**
   * Get repository details
   */
  async getRepo(owner: string, repo: string): Promise<RepositoryDetails> {
    // URL encode the owner and repo
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const endpoint = `/repos/${encodedOwner}/${encodedRepo}`;
    
    console.log(`GitHub API request: ${endpoint} (decoded: ${owner}/${repo})`);
    
    try {
      return await this.request<RepositoryDetails>(endpoint);
    } catch (error) {
      // Provide more context in error message
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch repository ${owner}/${repo}: ${errorMessage}`);
    }
  }

  /**
   * Get repository contents (file tree)
   */
  async getRepoContents(
    owner: string,
    repo: string,
    path: string = "",
    ref?: string
  ): Promise<FileTreeItem[] | FileContent> {
    const params = new URLSearchParams();
    if (ref) params.set("ref", ref);

    // URL encode the path components
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const encodedPath = path ? encodeURIComponent(path) : "";

    const query = params.toString();
    const endpoint = `/repos/${encodedOwner}/${encodedRepo}/contents${encodedPath ? `/${encodedPath}` : ""}${query ? `?${query}` : ""}`;
    
    console.log(`GitHub API request: ${endpoint} (decoded: ${owner}/${repo}${path ? `/${path}` : ""})`);
    
    try {
      const contents = await this.request<FileTreeItem[] | FileContent>(endpoint);
      return contents;
    } catch (error) {
      // Provide more context in error message
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to fetch contents for ${owner}/${repo}${path ? `/${path}` : ""}: ${errorMessage}`);
    }
  }

  /**
   * Get file content
   */
  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<FileContent> {
    const contents = await this.getRepoContents(owner, repo, path, ref);
    if (Array.isArray(contents)) {
      throw new Error("Path is a directory, not a file");
    }
    return contents;
  }

  /**
   * Create or update file
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
    sha?: string // Required for updates
  ): Promise<{
    content: {
      name: string;
      path: string;
      sha: string;
    };
    commit: {
      sha: string;
      message: string;
    };
  }> {
    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
    };
    if (branch) body.branch = branch;
    if (sha) body.sha = sha; // Update existing file

    return this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: sha ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * List commits
   */
  async listCommits(
    owner: string,
    repo: string,
    options?: {
      sha?: string;
      path?: string;
      author?: string;
      since?: string;
      until?: string;
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    sha: string;
    commit: {
      message: string;
      author: { name: string; email: string; date: string };
    };
    author: { login: string } | null;
  }>> {
    const params = new URLSearchParams();
    if (options?.sha) params.set("sha", options.sha);
    if (options?.path) params.set("path", options.path);
    if (options?.author) params.set("author", options.author);
    if (options?.since) params.set("since", options.since);
    if (options?.until) params.set("until", options.until);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/commits${query ? `?${query}` : ""}`);
  }

  /**
   * Create issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed";
    html_url: string;
  }> {
    return this.request(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });
  }

  /**
   * List issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      labels?: string;
      sort?: "created" | "updated" | "comments";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed";
    labels: Array<{ name: string }>;
    html_url: string;
  }>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.labels) params.set("labels", options.labels);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/issues${query ? `?${query}` : ""}`);
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed" | "merged";
    html_url: string;
  }> {
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        head,
        base,
        body,
      }),
    });
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      head?: string;
      base?: string;
      sort?: "created" | "updated" | "popularity";
      direction?: "asc" | "desc";
      per_page?: number;
      page?: number;
    }
  ): Promise<Array<{
    number: number;
    title: string;
    body?: string;
    state: "open" | "closed" | "merged";
    head: { ref: string };
    base: { ref: string };
    html_url: string;
  }>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.head) params.set("head", options.head);
    if (options?.base) params.set("base", options.base);
    if (options?.sort) params.set("sort", options.sort);
    if (options?.direction) params.set("direction", options.direction);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/pulls${query ? `?${query}` : ""}`);
  }

  /**
   * List workflow runs
   */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    options?: {
      actor?: string;
      branch?: string;
      event?: string;
      status?: "completed" | "action_required" | "cancelled" | "failure" | "neutral" | "skipped" | "stale" | "success" | "timed_out" | "in_progress" | "queued" | "requested" | "waiting";
      per_page?: number;
      page?: number;
    }
  ): Promise<{
    workflow_runs: Array<{
      id: number;
      name: string;
      status: "completed" | "in_progress" | "queued" | "waiting";
      conclusion: "success" | "failure" | "cancelled" | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      head_branch: string;
      event: string;
    }>;
  }> {
    const params = new URLSearchParams();
    if (options?.actor) params.set("actor", options.actor);
    if (options?.branch) params.set("branch", options.branch);
    if (options?.event) params.set("event", options.event);
    if (options?.status) params.set("status", options.status);
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));

    const query = params.toString();
    return this.request(`/repos/${owner}/${repo}/actions/runs${query ? `?${query}` : ""}`);
  }
}

