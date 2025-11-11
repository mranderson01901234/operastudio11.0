/**
 * Decode base64 string to UTF-8 string (browser-compatible)
 * Handles UTF-8 encoding properly unlike atob which returns binary string
 */
export function base64ToUtf8(base64: string): string {
  if (typeof window === "undefined") {
    // Server-side: use Buffer
    return Buffer.from(base64, "base64").toString("utf8");
  }

  // Browser: decode base64 then convert binary string to UTF-8
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

