/**
 * Utility functions for fetching high-resolution images and logos
 */

/**
 * Get high-resolution favicon URL
 * Uses Google's favicon service with larger size parameter
 */
export function getHighResFavicon(hostname: string, size: number = 128): string {
  // Remove www. prefix if present
  const cleanHostname = hostname.replace(/^www\./, "");
  return `https://www.google.com/s2/favicons?domain=${cleanHostname}&sz=${size}`;
}

/**
 * Get logo from Clearbit Logo API (high resolution)
 * Falls back to favicon if Clearbit doesn't have the logo
 */
export function getLogoUrl(hostname: string): string {
  const cleanHostname = hostname.replace(/^www\./, "");
  // Clearbit provides high-resolution logos
  return `https://logo.clearbit.com/${cleanHostname}`;
}

/**
 * Determine if an image URL is likely a logo vs a regular image
 * Logos are typically square, small file sizes, and from specific paths
 */
export function isLikelyLogo(url: string, hostname?: string): boolean {
  const lowerUrl = url.toLowerCase();
  const logoPatterns = [
    /logo/i,
    /icon/i,
    /favicon/i,
    /brand/i,
    /\.(svg|ico)$/i,
  ];
  
  // Check URL patterns
  if (logoPatterns.some(pattern => pattern.test(lowerUrl))) {
    return true;
  }
  
  // Check if it's from a known logo CDN
  const logoCdns = [
    'logo.clearbit.com',
    'logo.clearbit',
    'cdn.logo.com',
    'logos-world.net',
  ];
  
  if (logoCdns.some(cdn => lowerUrl.includes(cdn))) {
    return true;
  }
  
  return false;
}

/**
 * Prefer full image URL over thumbnail for better quality
 * For image searches, use the full image URL instead of thumbnail
 */
export function getBestImageUrl(
  thumbnailUrl?: string,
  fullImageUrl?: string,
  hostname?: string
): string | undefined {
  // If we have a full image URL, prefer it (especially for image searches)
  if (fullImageUrl) {
    return fullImageUrl;
  }
  
  // If thumbnail exists and looks like a logo, use it
  if (thumbnailUrl && isLikelyLogo(thumbnailUrl, hostname)) {
    return thumbnailUrl;
  }
  
  // Otherwise use thumbnail as fallback
  return thumbnailUrl;
}

/**
 * Enhance image URL to get higher resolution version if possible
 * Some image URLs can be modified to get higher resolution versions
 */
export function enhanceImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // For some CDNs, we can modify parameters to get higher resolution
    // Example: imgur, cloudinary, etc.
    
    // Remove size restrictions if present
    const sizeParams = ['w', 'width', 'h', 'height', 'size', 's'];
    sizeParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // For some services, add quality parameter
    if (!urlObj.searchParams.has('q') && !urlObj.searchParams.has('quality')) {
      urlObj.searchParams.set('q', '95'); // High quality
    }
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

