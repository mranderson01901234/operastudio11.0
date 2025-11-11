/**
 * GitHub tool definitions for Gemini function calling.
 * These tools allow the LLM to interact with GitHub repositories via the GitHub API.
 */

import type { ToolDefinition } from "./tool-definitions";

/**
 * GitHub tools available when a GitHub account is connected.
 * These tools are only available when an active GitHub account exists.
 */
export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: "github_list_repos",
    description: "List user's GitHub repositories. Use this to discover available repositories, search for specific repos, or browse repositories. Supports filtering by type (all/owner/member), sorting, and pagination. IMPORTANT: When presenting repository lists to the user, be concise. Simply list repositories with their key details (name, description, language, stars) without verbose explanations.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by repository type: 'all' (all repositories), 'owner' (repositories owned by user), or 'member' (repositories user is a member of). Default: 'all'"
        },
        sort: {
          type: "string",
          description: "Sort repositories by: 'created' (creation date), 'updated' (last updated), 'pushed' (last pushed), or 'full_name' (alphabetical). Default: 'updated'"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' (ascending) or 'desc' (descending). Default: 'desc'"
        },
        per_page: {
          type: "number",
          description: "Number of repositories per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: []
    }
  },
  {
    name: "github_get_repo",
    description: "Get detailed information about a specific GitHub repository. Use this to get repository metadata like description, stars, forks, language, default branch, and other details. Returns comprehensive repository information.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_files",
    description: "List files and directories in a GitHub repository. Use this to explore repository structure, browse directories, or find files. Returns a list of files and directories with their paths, types, and sizes. Supports specifying a path within the repository and a branch/ref.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "Path within repository (e.g., 'src/components' or 'README.md'). Leave empty for root directory. Default: '' (root)"
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA to list files from (e.g., 'main', 'v1.0.0', 'abc123'). Default: repository's default branch"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_read_file",
    description: "Read the contents of a file from a GitHub repository. USE THIS TOOL when the user asks to read, view, or get content from a GitHub file. Returns the file content as text (decoded from base64). Supports specifying a branch/ref. CRITICAL: This tool reads files from GitHub repositories, NOT from the local file system. For local files, use fs_read instead.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path within repository (e.g., 'README.md', 'src/index.js', 'docs/guide.md'). Must be a file, not a directory."
        },
        ref: {
          type: "string",
          description: "Branch, tag, or commit SHA to read file from (e.g., 'main', 'v1.0.0', 'abc123'). Default: repository's default branch"
        }
      },
      required: ["owner", "repo", "path"]
    }
  },
  {
    name: "github_write_file",
    description: "Create or update a file in a GitHub repository and commit the changes. USE THIS TOOL when asked to create, update, edit, modify, or write a file in a GitHub repository. This tool commits changes directly to GitHub - it does NOT just edit the file in the Monaco editor. The Monaco editor allows viewing/editing files locally, but github_write_file actually commits changes to the repository. DO NOT output file content in your message first - call this tool FIRST, then provide a brief confirmation. CRITICAL: This tool writes files to GitHub repositories, NOT to the local file system. For local files, use fs_write instead. Always write the complete file content, not partial content. The SHA parameter is optional - if not provided, it will be automatically fetched for existing files.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        path: {
          type: "string",
          description: "File path within repository (e.g., 'README.md', 'src/index.js', 'docs/guide.md')"
        },
        content: {
          type: "string",
          description: "Complete file content to write. Include all content, not just changes."
        },
        message: {
          type: "string",
          description: "Commit message describing the change (e.g., 'Update README.md', 'Add new feature', 'Fix bug'). If not provided, a default message will be generated."
        },
        branch: {
          type: "string",
          description: "Branch to commit to (e.g., 'main', 'develop'). Default: repository's default branch"
        }
      },
      required: ["owner", "repo", "path", "content"]
    }
  },
  {
    name: "github_list_commits",
    description: "List commits from a GitHub repository. Use this to view commit history, see recent changes, or browse commits. Supports filtering by author, path, date range, and pagination. Returns commit information including SHA, message, author, and date.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        sha: {
          type: "string",
          description: "Branch or commit SHA to list commits from (e.g., 'main', 'develop', 'abc123'). Default: repository's default branch"
        },
        path: {
          type: "string",
          description: "Filter commits by file path (e.g., 'src/index.js' to see commits affecting that file)"
        },
        author: {
          type: "string",
          description: "Filter commits by author username"
        },
        since: {
          type: "string",
          description: "Filter commits after this date (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"
        },
        until: {
          type: "string",
          description: "Filter commits before this date (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')"
        },
        per_page: {
          type: "number",
          description: "Number of commits per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_issue",
    description: "Create a new issue in a GitHub repository. USE THIS TOOL when the user asks to create, open, or file an issue. Creates an issue with a title and optional body text and labels.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        title: {
          type: "string",
          description: "Issue title (required)"
        },
        body: {
          type: "string",
          description: "Issue body/description (optional, supports Markdown)"
        },
        labels: {
          type: "array",
          description: "Array of label names to apply to the issue (e.g., ['bug', 'enhancement', 'help wanted'])",
          items: {
            type: "string"
          }
        }
      },
      required: ["owner", "repo", "title"]
    }
  },
  {
    name: "github_list_issues",
    description: "List issues from a GitHub repository. Use this to view open/closed issues, search for specific issues, or browse issue lists. Supports filtering by state, labels, sorting, and pagination. IMPORTANT: When presenting issue lists to the user, be concise. Simply list issues with their key details (number, title, state, labels) without verbose explanations.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by issue state: 'open', 'closed', or 'all'. Default: 'open'"
        },
        labels: {
          type: "string",
          description: "Filter by label names (comma-separated, e.g., 'bug,enhancement')"
        },
        sort: {
          type: "string",
          description: "Sort by: 'created' (creation date), 'updated' (last updated), or 'comments' (number of comments). Default: 'created'"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' (ascending) or 'desc' (descending). Default: 'desc'"
        },
        per_page: {
          type: "number",
          description: "Number of issues per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_create_pr",
    description: "Create a new pull request in a GitHub repository. USE THIS TOOL when the user asks to create, open, or submit a pull request. Creates a PR from one branch to another with a title and optional body text.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        title: {
          type: "string",
          description: "Pull request title (required)"
        },
        head: {
          type: "string",
          description: "Branch name containing the changes (the branch to merge FROM, e.g., 'feature-branch', 'fix-bug')"
        },
        base: {
          type: "string",
          description: "Branch name to merge INTO (usually 'main' or 'master', the target branch)"
        },
        body: {
          type: "string",
          description: "Pull request body/description (optional, supports Markdown)"
        }
      },
      required: ["owner", "repo", "title", "head", "base"]
    }
  },
  {
    name: "github_list_prs",
    description: "List pull requests from a GitHub repository. Use this to view open/closed/merged PRs, search for specific PRs, or browse PR lists. Supports filtering by state, head/base branch, sorting, and pagination. IMPORTANT: When presenting PR lists to the user, be concise. Simply list PRs with their key details (number, title, state, branches) without verbose explanations.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        state: {
          type: "string",
          description: "Filter by PR state: 'open', 'closed', or 'all'. Default: 'open'"
        },
        head: {
          type: "string",
          description: "Filter by head branch (e.g., 'user:branch-name' or 'branch-name')"
        },
        base: {
          type: "string",
          description: "Filter by base branch (e.g., 'main', 'develop')"
        },
        sort: {
          type: "string",
          description: "Sort by: 'created' (creation date), 'updated' (last updated), or 'popularity' (most interactions). Default: 'created'"
        },
        direction: {
          type: "string",
          description: "Sort direction: 'asc' (ascending) or 'desc' (descending). Default: 'desc'"
        },
        per_page: {
          type: "number",
          description: "Number of PRs per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  },
  {
    name: "github_list_workflows",
    description: "List GitHub Actions workflow runs from a repository. Use this to view workflow execution history, check CI/CD status, or see recent workflow runs. Supports filtering by branch, status, event type, and pagination. Returns workflow run information including status, conclusion, and timing.",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner (username or organization name)"
        },
        repo: {
          type: "string",
          description: "Repository name"
        },
        branch: {
          type: "string",
          description: "Filter by branch name (e.g., 'main', 'develop')"
        },
        status: {
          type: "string",
          description: "Filter by workflow status: 'completed', 'in_progress', 'queued', 'waiting', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'requested'"
        },
        event: {
          type: "string",
          description: "Filter by event type that triggered the workflow (e.g., 'push', 'pull_request', 'workflow_dispatch')"
        },
        actor: {
          type: "string",
          description: "Filter by user who triggered the workflow"
        },
        per_page: {
          type: "number",
          description: "Number of workflow runs per page (default: 30, max: 100)"
        },
        page: {
          type: "number",
          description: "Page number for pagination (default: 1)"
        }
      },
      required: ["owner", "repo"]
    }
  }
];

