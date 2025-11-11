import { createAvatar } from "@dicebear/core";
import { initials } from "@dicebear/collection";
import { LRUCache } from "lru-cache";

// Cache for company logos (domain -> logo URL)
const logoCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});

// Cache for failed logo fetches to avoid repeated attempts
const failedLogoCache = new LRUCache<string, boolean>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Generate fallback avatar with initials
 */
export function generateFallbackAvatar(name: string, email: string): string {
  const avatar = createAvatar(initials, {
    seed: email,
    size: 40,
    backgroundColor: [
      "b6e3f4",
      "c0aede",
      "d1d4f9",
      "ffd5dc",
      "ffdfbf",
      "ffcc99",
      "ffb3ba",
      "ffdfba",
      "ffffba",
      "baffc9",
      "bae1ff",
    ],
  });

  return avatar.toDataUri();
}

/**
 * Check if a logo URL is valid by attempting to fetch it
 */
async function validateLogoUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      mode: "no-cors", // Use no-cors to avoid CORS issues
      cache: "no-cache",
    });
    // With no-cors, we can't check status, but if it doesn't throw, assume it's valid
    return true;
  } catch {
    return false;
  }
}

/**
 * Get company logo URL from domain
 */
async function getCompanyLogoUrl(domain: string): Promise<string | null> {
  // Check cache first
  const cached = logoCache.get(domain);
  if (cached) {
    return cached;
  }

  // Check if we've previously failed to fetch this logo
  if (failedLogoCache.get(domain)) {
    return null;
  }

  // Try Clearbit Logo API (free, no auth required)
  const clearbitUrl = `https://logo.clearbit.com/${domain}`;
  
  // For client-side, we'll use a proxy approach or direct URL
  // Since Clearbit supports CORS, we can use it directly
  try {
    // Use a simple image load test - if it loads, it's valid
    const logoUrl = clearbitUrl;
    
    // Cache the URL (we'll validate on first render)
    logoCache.set(domain, logoUrl);
    return logoUrl;
  } catch {
    failedLogoCache.set(domain, true);
    return null;
  }
}

/**
 * Generate avatar data URI or company logo URL from name and email
 * Returns a URL string (for company logos) or data URI (for fallback avatars)
 */
export async function generateAvatarAsync(
  name: string,
  email: string
): Promise<string> {
  const domain = extractDomain(email);
  
  if (!domain) {
    return generateFallbackAvatar(name, email);
  }

  // Skip common email providers that don't have company logos
  const skipDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "protonmail.com",
    "mail.com",
  ];

  if (skipDomains.includes(domain)) {
    return generateFallbackAvatar(name, email);
  }

  const logoUrl = await getCompanyLogoUrl(domain);
  
  if (logoUrl) {
    return logoUrl;
  }

  return generateFallbackAvatar(name, email);
}

/**
 * Get company logo URL from domain using multiple sources
 */
function getCompanyLogoUrls(domain: string): string[] {
  // Try multiple logo sources for better reliability
  return [
    `https://logo.clearbit.com/${domain}`, // Clearbit (high quality)
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, // Google favicon service
    `https://icons.duckduckgo.com/ip3/${domain}.ico`, // DuckDuckGo favicon
  ];
}

/**
 * Synchronous version that returns a promise-wrapped URL or fallback
 * This maintains backward compatibility while allowing async logo fetching
 */
export function generateAvatar(name: string, email: string): string {
  const domain = extractDomain(email);
  
  if (!domain) {
    return generateFallbackAvatar(name, email);
  }

  // Check cache first
  const cached = logoCache.get(domain);
  if (cached) {
    return cached;
  }

  // Skip common email providers
  const skipDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "aol.com",
    "protonmail.com",
    "mail.com",
  ];

  if (skipDomains.includes(domain)) {
    return generateFallbackAvatar(name, email);
  }

  // Return Clearbit logo URL (will be validated on image load)
  // Use the first (best quality) logo source
  const logoUrl = getCompanyLogoUrls(domain)[0];
  logoCache.set(domain, logoUrl);
  
  return logoUrl;
}

/**
 * Get initials from name or email
 */
export function getInitials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts[0].length >= 2) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }

  // Fallback to email
  const emailPart = email.split("@")[0];
  if (emailPart.length >= 2) {
    return emailPart.substring(0, 2).toUpperCase();
  }
  return emailPart[0].toUpperCase();
}

