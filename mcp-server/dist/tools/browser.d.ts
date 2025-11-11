import type { SecurityPolicy } from "../security.js";
export interface BrowserAction {
    type: "navigate" | "click" | "fill" | "select" | "wait" | "screenshot" | "download" | "extract_text" | "get_url";
    selector?: string;
    value?: string;
    url?: string;
    waitFor?: "load" | "networkidle" | "domcontentloaded" | "download" | string;
    timeout?: number;
    options?: string;
    saveTo?: string;
    screenshotPath?: string;
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
export declare class BrowserTools {
    private security;
    private browser;
    private page;
    private downloadPath;
    constructor(security: SecurityPolicy, downloadPath?: string);
    /**
     * Execute a sequence of browser actions
     */
    executeActions(url: string, actions: BrowserAction[], headless?: boolean, timeout?: number): Promise<BrowserAutomationResult>;
    /**
     * Simplified method for common download scenarios
     */
    interactiveDownload(url: string, formFills?: Record<string, string>, downloadButtonSelector?: string, saveAs?: string, headless?: boolean): Promise<BrowserAutomationResult>;
}
//# sourceMappingURL=browser.d.ts.map