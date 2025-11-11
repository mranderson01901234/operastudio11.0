import { spawn } from "child_process";
/**
 * Command execution tools for MCP server
 */
export class CommandTools {
    security;
    constructor(security) {
        this.security = security;
    }
    /**
     * Execute shell command
     */
    async execute(command, args = [], cwd, timeout = 300000, // 5 minutes for installations
    useSudo = false, sudoPassword) {
        // Check security
        const cmdCheck = this.security.isCommandAllowed(command);
        if (!cmdCheck.allowed) {
            throw new Error(`PERMISSION_DENIED: ${cmdCheck.reason}`);
        }
        // If useSudo is requested, wrap command with sudo
        let finalCommand = command;
        let finalArgs = args;
        if (useSudo) {
            // Use sudo with password if provided, otherwise use sudo -A (askpass)
            if (sudoPassword) {
                // Use echo to pipe password to sudo -S (read password from stdin)
                finalCommand = "sudo";
                finalArgs = ["-S", command, ...args];
            }
            else {
                // Try passwordless sudo first, or use sudo -A with SUDO_ASKPASS
                finalCommand = "sudo";
                finalArgs = [command, ...args];
            }
        }
        return new Promise((resolve, reject) => {
            const proc = spawn(finalCommand, finalArgs, {
                cwd: cwd || process.cwd(),
                shell: true,
                env: {
                    ...process.env,
                    ...(sudoPassword ? {} : {
                        // Try to use passwordless sudo or system askpass
                        SUDO_ASKPASS: process.env.SUDO_ASKPASS || "/usr/bin/ssh-askpass",
                    }),
                },
            });
            // If password provided, write it to stdin
            if (useSudo && sudoPassword) {
                proc.stdin?.write(`${sudoPassword}\n`);
                proc.stdin?.end();
            }
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            proc.stderr.on("data", (data) => {
                const errorText = data.toString();
                stderr += errorText;
                // Check for sudo password prompt
                if (errorText.includes("[sudo] password") || errorText.includes("Password:")) {
                    // Command needs sudo but password wasn't provided or was wrong
                    proc.kill();
                    clearTimeout(timeoutId);
                    resolve({
                        stdout,
                        stderr,
                        exitCode: 1,
                        needsSudo: true,
                    });
                    return;
                }
            });
            const timeoutId = setTimeout(() => {
                proc.kill();
                reject(new Error(`TIMEOUT: Command exceeded timeout of ${timeout}ms`));
            }, timeout);
            proc.on("close", (code) => {
                clearTimeout(timeoutId);
                // Check if command failed due to permission denied
                const permissionDenied = stderr.includes("Permission denied") ||
                    stderr.includes("EACCES") ||
                    (code !== 0 && stderr.includes("permission"));
                if (permissionDenied && !useSudo) {
                    resolve({
                        stdout,
                        stderr,
                        exitCode: code || 0,
                        needsSudo: true,
                    });
                    return;
                }
                resolve({
                    stdout,
                    stderr,
                    exitCode: code || 0,
                });
            });
            proc.on("error", (error) => {
                clearTimeout(timeoutId);
                reject(new Error(`EXECUTION_ERROR: ${error.message}`));
            });
        });
    }
}
//# sourceMappingURL=command.js.map