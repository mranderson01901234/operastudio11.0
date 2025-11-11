/**
 * Pipeline tool definition for sequential operations.
 * Allows Gemini to plan and execute multi-step pipelines with guards, retries, and logging.
 * 
 * This is a complex tool with nested structures. The ToolDefinition interface is simplified,
 * but Gemini's function calling supports full JSON Schema, so we'll pass the full schema.
 */

// Note: This tool uses a more complex schema than the standard ToolDefinition interface
// We'll handle it specially in the Gemini client to pass the full JSON Schema
export const PIPELINE_TOOL = {
  name: "ops_run_pipeline",
  description: "Run a sequential local-environment pipeline of steps such as download, extract, install, chmod, exec, and service actions. Each step runs in order and can be gated by pre-checks. Use this for complex multi-step operations like downloading and installing software, setting up services, or running sequential commands. The pipeline handles retries, error handling, and idempotency automatically.",
  parameters: {
    type: "object",
    properties: {
      consent_token: {
        type: "string",
        description: "User-provided token proving interactive consent for privileged actions. Use 'user-approved' for standard operations."
      },
      idempotency_key: {
        type: "string",
        description: "Client-generated unique key to make the pipeline safe to retry. Generate a unique key like 'operation-{timestamp}' or 'task-{hash}'."
      },
      dry_run: {
        type: "boolean",
        description: "If true, only return the plan without executing. Use this to preview what will happen."
      },
      env: {
        type: "object",
        description: "Environment variables applied to all steps. Object with string values."
      },
      default_cwd: {
        type: "string",
        description: "Working directory for steps that omit cwd. Defaults to user's home directory if not specified."
      },
      steps: {
        type: "array",
        description: "Array of pipeline steps to execute in order. Each step has a type and corresponding configuration.",
        items: {
          type: "object",
          description: "A pipeline step with type-specific configuration",
          properties: {
            name: {
              type: "string",
              description: "Human-readable step name for logging and display."
            },
            type: {
              type: "string",
              description: "Step kind: download, extract, install_pkg, chmod, write_file, exec, git_clone, or service",
              enum: ["download", "extract", "install_pkg", "chmod", "write_file", "exec", "git_clone", "service"]
            },
            os: {
              type: "string",
              description: "OS filter: linux, macos, windows, or any (default: any)",
              enum: ["linux", "macos", "windows", "any"]
            },
            cwd: {
              type: "string",
              description: "Working directory for this step (overrides default_cwd)"
            },
            timeout_ms: {
              type: "number",
              description: "Timeout in milliseconds (minimum: 1000, default: 300000 = 5 minutes)"
            },
            sudo: {
              type: "boolean",
              description: "Execute step with sudo privileges (default: false)"
            },
            retries: {
              type: "number",
              description: "Number of retry attempts if step fails (minimum: 0, default: 0)"
            },
            continue_on_error: {
              type: "boolean",
              description: "Continue to next step even if this step fails (default: false)"
            },
            download: {
              type: "object",
              description: "Configuration for download step. Required when type='download'",
              properties: {
                url: { type: "string", description: "URL to download from" },
                dest: { type: "string", description: "Destination file path" },
                sha256: { type: "string", description: "Optional SHA256 hash for integrity verification" }
              },
              required: ["url", "dest"]
            } as any,
            extract: {
              type: "object",
              description: "Configuration for extract step. Required when type='extract'",
              properties: {
                archive: { type: "string", description: "Path to archive file to extract" },
                dest: { type: "string", description: "Destination directory path" },
                format: { type: "string", description: "Archive format: zip, tar, tar.gz, tar.xz, or auto (default: auto)", enum: ["zip", "tar", "tar.gz", "tar.xz", "auto"] },
                strip_components: { type: "number", description: "Number of leading path components to strip (default: 0)" }
              },
              required: ["archive", "dest"]
            } as any,
            install_pkg: {
              type: "object",
              description: "Configuration for install_pkg step. Required when type='install_pkg'",
              properties: {
                manager: { type: "string", description: "Package manager to use", enum: ["apt", "dnf", "pacman", "brew", "winget", "choco", "dpkg", "rpm"] },
                packages: { type: "array", description: "Array of package names to install", items: { type: "string" } },
                flags: { type: "array", description: "Additional flags to pass to package manager", items: { type: "string" } },
                file: { type: "string", description: "Local package file path for dpkg/rpm installers" },
                update_index: { type: "boolean", description: "Update package index before installing (default: true)" }
              },
              required: ["manager"]
            } as any,
            chmod: {
              type: "object",
              description: "Configuration for chmod step. Required when type='chmod'",
              properties: {
                path: { type: "string", description: "File or directory path to modify" },
                mode: { type: "string", description: "Permission mode (e.g., '755' or 'u+x')" }
              },
              required: ["path", "mode"]
            } as any,
            write_file: {
              type: "object",
              description: "Configuration for write_file step. Required when type='write_file'",
              properties: {
                path: { type: "string", description: "File path to write" },
                content_b64: { type: "string", description: "Base64-encoded file content" },
                overwrite: { type: "boolean", description: "Overwrite existing file (default: false)" }
              },
              required: ["path", "content_b64"]
            } as any,
            exec: {
              type: "object",
              description: "Configuration for exec step. Required when type='exec'",
              properties: {
                cmd: { type: "string", description: "Command to execute" },
                args: { type: "array", description: "Command arguments (default: empty array)", items: { type: "string" } },
                shell: { type: "boolean", description: "Execute in shell (default: false)" },
                env: { type: "object", description: "Environment variables for this command" }
              },
              required: ["cmd"]
            } as any,
            git_clone: {
              type: "object",
              description: "Configuration for git_clone step. Required when type='git_clone'",
              properties: {
                repo: { type: "string", description: "Git repository URL" },
                dest: { type: "string", description: "Destination directory path" },
                branch: { type: "string", description: "Branch to checkout (default: 'main')" },
                depth: { type: "number", description: "Shallow clone depth (default: 1)" }
              },
              required: ["repo", "dest"]
            } as any,
            service: {
              type: "object",
              description: "Configuration for service step. Required when type='service'",
              properties: {
                action: { type: "string", description: "Service action to perform", enum: ["start", "stop", "restart", "enable", "disable", "status"] },
                name: { type: "string", description: "Service name" }
              },
              required: ["action", "name"]
            } as any,
            precheck: {
              type: "object",
              description: "Pre-check conditions. Step is skipped if precheck passes.",
              properties: {
                file_exists: { type: "string", description: "Skip step if this file exists" },
                command_succeeds: { type: "string", description: "Skip step if this command exits with code 0" }
              }
            } as any,
            postexpect: {
              type: "object",
              description: "Post-execution expectations. Pipeline fails if expectation not met.",
              properties: {
                file_exists: { type: "string", description: "Require this file to exist after step" },
                port_open: { type: "number", description: "Require this port to be open after step" },
                command_succeeds: { type: "string", description: "Require this command to exit with code 0 after step" }
              }
            } as any
          },
          required: ["name", "type"]
        }
      }
    },
    required: ["consent_token", "steps"]
  }
};

