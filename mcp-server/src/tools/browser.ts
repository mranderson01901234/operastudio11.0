import { chromium, type Browser, type Page } from "playwright";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import type { SecurityPolicy } from "../security.js";

export interface BrowserAction {
  type: "navigate" | "click" | "fill" | "select" | "wait" | "screenshot" | "download" | "extract_text" | "get_url";
  selector?: string;
  value?: string;
  url?: string;
  waitFor?: "load" | "networkidle" | "domcontentloaded" | "download" | string; // selector string
  timeout?: number;
  options?: string; // for select dropdowns: "value" | "label" | "index"
  saveTo?: string; // for download action
  screenshotPath?: string; // for screenshot action
}

export interface BrowserAutomationResult {
  success: boolean;
  message: string;
  downloadPath?: string;
  screenshotPath?: string;
  extractedText?: string;
  currentUrl?: string;
  error?: string;
}

/**
 * Browser automation tools using Playwright
 * Handles interactive web tasks like form filling, clicking, downloading
 */
export class BrowserTools {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private downloadPath: string;

  constructor(
    private security: SecurityPolicy,
    downloadPath?: string
  ) {
    // Default to ~/Downloads, but check security policy
    const userHome = os.homedir();
    const defaultPath = path.join(userHome, "Downloads");
    
    if (downloadPath) {
      const pathCheck = this.security.isPathAllowed(downloadPath);
      if (!pathCheck.allowed) {
        throw new Error(`Download path not allowed: ${pathCheck.reason}`);
      }
      this.downloadPath = downloadPath;
    } else {
      this.downloadPath = defaultPath;
    }

    // Ensure download directory exists
    fs.mkdir(this.downloadPath, { recursive: true }).catch(() => {
      // Ignore errors, directory might already exist
    });
  }

  /**
   * Execute a sequence of browser actions
   */
  async executeActions(
    url: string,
    actions: BrowserAction[],
    headless: boolean = true,
    timeout: number = 300000 // 5 minutes default
  ): Promise<BrowserAutomationResult> {
    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      // Create context with download handling
      const context = await this.browser.newContext({
        acceptDownloads: true,
      });

      this.page = await context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(timeout);

      // Navigate to initial URL
      await this.page.goto(url, { waitUntil: "domcontentloaded" });

      let downloadPath: string | undefined;
      let screenshotPath: string | undefined;
      let extractedText: string | undefined;

      // Execute each action
      for (const action of actions) {
        const actionTimeout = action.timeout || timeout;

        switch (action.type) {
          case "navigate":
            if (action.url) {
              await this.page.goto(action.url, {
                waitUntil: (action.waitFor as any) || "domcontentloaded",
                timeout: actionTimeout,
              });
            }
            break;

          case "click":
            if (!action.selector) {
              throw new Error("Click action requires selector");
            }
            await this.page.click(action.selector, { timeout: actionTimeout });
            break;

          case "fill":
            if (!action.selector || !action.value) {
              throw new Error("Fill action requires selector and value");
            }
            await this.page.fill(action.selector, action.value, {
              timeout: actionTimeout,
            });
            break;

          case "select":
            if (!action.selector || !action.value) {
              throw new Error("Select action requires selector and value");
            }
            const selectOption = action.options || "value";
            if (selectOption === "value") {
              await this.page.selectOption(action.selector, action.value, {
                timeout: actionTimeout,
              });
            } else if (selectOption === "label") {
              await this.page.selectOption(action.selector, {
                label: action.value,
              }, { timeout: actionTimeout });
            } else if (selectOption === "index") {
              await this.page.selectOption(action.selector, {
                index: parseInt(action.value),
              }, { timeout: actionTimeout });
            }
            break;

          case "wait":
            if (action.waitFor === "load") {
              await this.page.waitForLoadState("load", { timeout: actionTimeout });
            } else if (action.waitFor === "networkidle") {
              await this.page.waitForLoadState("networkidle", {
                timeout: actionTimeout,
              });
            } else if (action.waitFor === "domcontentloaded") {
              await this.page.waitForLoadState("domcontentloaded", {
                timeout: actionTimeout,
              });
            } else if (action.waitFor === "download") {
              // Wait for download to start
              const downloadPromise = this.page.waitForEvent("download", {
                timeout: actionTimeout,
              });
              const download = await downloadPromise;
              
              // Save download
              const fileName = download.suggestedFilename() || "download";
              const savePath = action.saveTo 
                ? path.resolve(action.saveTo)
                : path.join(this.downloadPath, fileName);
              
              // Check if path is allowed
              const pathCheck = this.security.isPathAllowed(savePath);
              if (!pathCheck.allowed) {
                throw new Error(`Download path not allowed: ${pathCheck.reason}`);
              }

              await download.saveAs(savePath);
              downloadPath = savePath;
            } else if (action.selector) {
              // Wait for selector to appear
              await this.page.waitForSelector(action.selector, {
                timeout: actionTimeout,
              });
            } else if (action.value) {
              // Wait for timeout (milliseconds)
              await this.page.waitForTimeout(parseInt(action.value));
            }
            break;

          case "screenshot":
            const screenshotFileName = action.screenshotPath || 
              `screenshot-${Date.now()}.png`;
            const screenshotFullPath = path.isAbsolute(screenshotFileName)
              ? screenshotFileName
              : path.join(this.downloadPath, screenshotFileName);
            
            const screenshotCheck = this.security.isPathAllowed(screenshotFullPath);
            if (!screenshotCheck.allowed) {
              throw new Error(`Screenshot path not allowed: ${screenshotCheck.reason}`);
            }

            await this.page.screenshot({ path: screenshotFullPath });
            screenshotPath = screenshotFullPath;
            break;

          case "extract_text":
            if (!action.selector) {
              throw new Error("Extract text action requires selector");
            }
            extractedText = await this.page.textContent(action.selector, {
              timeout: actionTimeout,
            }) || undefined;
            break;

          case "get_url":
            // Just get current URL, no action needed
            break;

          case "download":
            // Wait for download and save
            const downloadEvent = await this.page.waitForEvent("download", {
              timeout: actionTimeout,
            });
            
            const fileName = downloadEvent.suggestedFilename() || "download";
            const finalSavePath = action.saveTo
              ? path.resolve(action.saveTo)
              : path.join(this.downloadPath, fileName);
            
            const finalPathCheck = this.security.isPathAllowed(finalSavePath);
            if (!finalPathCheck.allowed) {
              throw new Error(`Download path not allowed: ${finalPathCheck.reason}`);
            }

            await downloadEvent.saveAs(finalSavePath);
            downloadPath = finalSavePath;
            break;

          default:
            throw new Error(`Unknown action type: ${(action as any).type}`);
        }
      }

      const currentUrl = this.page.url();

      return {
        success: true,
        message: "Browser automation completed successfully",
        downloadPath,
        screenshotPath,
        extractedText,
        currentUrl,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: "Browser automation failed",
        error: errorMessage,
      };
    } finally {
      // Cleanup
      if (this.page) {
        await this.page.close().catch(() => {});
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    }
  }

  /**
   * Simplified method for common download scenarios
   */
  async interactiveDownload(
    url: string,
    formFills?: Record<string, string>,
    downloadButtonSelector?: string,
    saveAs?: string,
    headless: boolean = true
  ): Promise<BrowserAutomationResult> {
    const actions: BrowserAction[] = [
      {
        type: "navigate",
        url,
        waitFor: "domcontentloaded",
      },
    ];

    // Fill forms if provided
    if (formFills) {
      for (const [selector, value] of Object.entries(formFills)) {
        // Try to determine if it's a select or input by checking the selector
        // For now, we'll try select first, and if it fails, the user can use browser_automation
        // with explicit action types
        actions.push({
          type: "select",
          selector,
          value,
          options: "value",
        });
      }
    }

    // Click download button if provided
    if (downloadButtonSelector) {
      actions.push({
        type: "click",
        selector: downloadButtonSelector,
      });
    }

    // Wait for download
    actions.push({
      type: "wait",
      waitFor: "download",
      timeout: 600000, // 10 minutes for large downloads
    });

    // Save download
    actions.push({
      type: "download",
      saveTo: saveAs,
    });

    return this.executeActions(url, actions, headless);
  }
}

