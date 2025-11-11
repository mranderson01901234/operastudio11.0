"use client";

import React from "react";
import { ExternalLink, Youtube, Headphones } from "lucide-react";

interface LinkWithFaviconProps {
  url: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Extract domain name from URL
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Get favicon URL for a domain
 * DISABLED: Favicon loading causes CORS errors and console spam
 * We'll just show the ExternalLink icon instead
 */
function getFaviconUrl(domain: string): string {
  // Return empty string to skip favicon loading and avoid CORS issues
  // The component will show ExternalLink icon instead
  return "";
}

/**
 * Check if URL is a YouTube video
 */
function isYouTubeVideo(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be/.test(url);
}

/**
 * Check if URL is a podcast platform
 */
function isPodcast(url: string, domain: string): boolean {
  const podcastDomains = [
    'spotify.com',
    'apple.com',
    'podcasts.apple.com',
    'anchor.fm',
    'podbean.com',
    'stitcher.com',
    'pandora.com',
    'iheart.com',
    'tunein.com',
    'castro.fm',
    'overcast.fm',
    'pocketcasts.com',
    'podcastaddict.com',
  ];
  
  const lowerDomain = domain.toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  return podcastDomains.some(podcastDomain => 
    lowerDomain.includes(podcastDomain) || lowerUrl.includes(podcastDomain) || lowerUrl.includes('podcast')
  );
}

/**
 * Get display name from domain (e.g., "reuters.com" -> "Reuters")
 * Also handles common domain name patterns
 */
function getDisplayName(domain: string, url: string): string {
  // Check for YouTube first
  if (isYouTubeVideo(url)) {
    return "YouTube";
  }
  
  // Check for podcasts
  if (isPodcast(url, domain)) {
    // Extract podcast platform name
    if (url.includes('spotify.com')) return "Spotify Podcast";
    if (url.includes('apple.com') || url.includes('podcasts.apple.com')) return "Apple Podcasts";
    if (url.includes('anchor.fm')) return "Anchor Podcast";
    return "Podcast";
  }
  
  // Remove www. prefix if present
  domain = domain.replace(/^www\./, "");
  
  const parts = domain.split(".");
  if (parts.length >= 2) {
    let name = parts[parts.length - 2];
    
    // Handle common patterns and brand names
    const brandMap: Record<string, string> = {
      "reuters": "Reuters",
      "google": "Google",
      "sciencedaily": "ScienceDaily",
      "github": "GitHub",
      "twitter": "Twitter",
      "facebook": "Facebook",
      "linkedin": "LinkedIn",
      "youtube": "YouTube",
      "reddit": "Reddit",
      "medium": "Medium",
      "stackoverflow": "Stack Overflow",
      "wikipedia": "Wikipedia",
      "blog": "Blog",
    };
    
    // Check if it's a known brand
    const lowerName = name.toLowerCase();
    if (brandMap[lowerName]) {
      return brandMap[lowerName];
    }
    
    // Handle Google subdomains
    if (lowerName === "google" || (parts.length >= 3 && parts[parts.length - 3] === "blog")) {
      return "Google";
    }
    
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return domain;
}

export function LinkWithFavicon({ url, children, className = "" }: LinkWithFaviconProps) {
  const domain = getDomain(url);
  // Always use the extracted company name from the domain, not the children text
  // This ensures we show "Reuters" instead of "Reuters AI News: https://..."
  const displayName = getDisplayName(domain, url);
  const isYouTube = isYouTubeVideo(url);
  const isPodcastLink = isPodcast(url, domain);

  // DISABLED: Favicon loading to avoid CORS errors and console spam
  // Always show ExternalLink icon for regular links, special icons for YouTube/podcasts

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 hover:underline transition-colors ${className}`}
      style={{ color: "rgb(59 130 246)" }} // text-blue-500 - same as folder icons
    >
      {isYouTube ? (
        <Youtube className="w-4 h-4 text-red-500" />
      ) : isPodcastLink ? (
        <Headphones className="w-4 h-4" />
      ) : (
        <ExternalLink className="w-4 h-4" />
      )}
      <span>{displayName}</span>
    </a>
  );
}

