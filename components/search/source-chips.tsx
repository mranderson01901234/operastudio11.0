"use client";

import React, { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SearchAnswerPayload } from "@/lib/search/search-result-types";
import { getHighResFavicon, getLogoUrl, getBestImageUrl, isLikelyLogo } from "@/lib/search/image-utils";

/**
 * Image component with multiple fallback sources
 */
function ImageWithFallback({
  src,
  alt,
  fallbackSources = [],
  fallbackText,
  width,
  height,
}: {
  src: string;
  alt: string;
  fallbackSources?: string[];
  fallbackText: string;
  width: number;
  height: number;
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [fallbackIndex, setFallbackIndex] = useState(-1);
  const [showFallback, setShowFallback] = useState(false);

  // Reset when src changes
  React.useEffect(() => {
    setCurrentSrc(src);
    setFallbackIndex(-1);
    setShowFallback(false);
  }, [src]);

  const handleError = () => {
    const nextIndex = fallbackIndex + 1;
    if (nextIndex < fallbackSources.length) {
      // Try next fallback source
      setCurrentSrc(fallbackSources[nextIndex]);
      setFallbackIndex(nextIndex);
    } else {
      // All sources failed, show text fallback
      setShowFallback(true);
    }
  };

  if (showFallback) {
    return (
      <div className="w-full h-full rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400 text-lg font-semibold">
        {fallbackText}
      </div>
    );
  }

  return (
    <Image
      key={currentSrc} // Force re-render when src changes
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      className="object-contain rounded-lg"
      unoptimized
      onError={handleError}
    />
  );
}

interface SourceChipsProps {
  sources: SearchAnswerPayload["sources"];
  maxVisible?: number;
}

/**
 * Rich source cards with thumbnails and descriptions
 * Horizontal scrollable row with enhanced previews
 */
export function SourceChips({ sources, maxVisible = 6 }: SourceChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // Check scroll position to show/hide arrows
  const checkScrollPosition = () => {
    if (!scrollRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    checkScrollPosition();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollPosition);
      window.addEventListener("resize", checkScrollPosition);
      return () => {
        container.removeEventListener("scroll", checkScrollPosition);
        window.removeEventListener("resize", checkScrollPosition);
      };
    }
  }, [sources]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    
    const cardWidth = 240 + 12; // Card width + gap
    const scrollAmount = cardWidth * 2; // Scroll 2 cards at a time
    
    const currentScroll = scrollRef.current.scrollLeft;
    const newScroll = direction === "left" 
      ? currentScroll - scrollAmount 
      : currentScroll + scrollAmount;
    
    scrollRef.current.scrollTo({
      left: newScroll,
      behavior: "smooth",
    });
  };
  
  if (sources.length === 0) {
    return null;
  }
  
  return (
    <div className="relative w-full group/container">
      {/* Left Arrow - Always visible */}
      <button
        className="absolute -left-10 top-[40%] -translate-y-1/2 z-20 cursor-pointer disabled:opacity-30"
        onClick={() => scroll("left")}
        disabled={!canScrollLeft}
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-8 w-8 text-zinc-400 drop-shadow-lg hover:scale-110 transition-transform" strokeWidth={2.5} />
      </button>

      {/* Scrollable Container */}
      <div 
        className="w-full overflow-x-auto overflow-y-hidden pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden" 
        ref={scrollRef} 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-3">
          {sources.map((source, idx) => {
            // Extract hostname from URL for logo/favicon
            let hostname: string | undefined;
            try {
              hostname = new URL(source.url).hostname;
            } catch {
              // URL parsing failed
            }
            
            // Build prioritized list of image sources to try
            const imageSources: Array<{ url: string; type: string }> = [];
            
            // 1. Thumbnail from API (highest priority if available)
            if (source.thumbnail) {
              imageSources.push({ url: source.thumbnail, type: 'thumbnail' });
            }
            
            // 2. Clearbit logo (high quality company logos)
            if (hostname) {
              imageSources.push({ url: getLogoUrl(hostname), type: 'logo' });
            }
            
            // 3. High-res favicon
            if (hostname) {
              imageSources.push({ url: getHighResFavicon(hostname, 64), type: 'favicon' });
            }
            
            // 4. Regular favicon from source
            if (source.favicon) {
              imageSources.push({ url: source.favicon, type: 'favicon' });
            }
            
            // Use first available source
            const primaryImageUrl = imageSources.length > 0 ? imageSources[0].url : undefined;
            
            return (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex-shrink-0"
              >
                <Card className="w-[240px] bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 transition-all cursor-pointer overflow-hidden">
                  {/* Horizontal Layout: Logo on left, content on right */}
                  <div className="flex gap-3 p-3">
                    {/* Logo/Image on Left */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-zinc-800/50 flex items-center justify-center overflow-hidden relative">
                      {primaryImageUrl ? (
                        <ImageWithFallback
                          src={primaryImageUrl}
                          alt={source.title}
                          fallbackSources={imageSources.slice(1).map(s => s.url)}
                          fallbackText={source.title.charAt(0).toUpperCase()}
                          width={48}
                          height={48}
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400 text-lg font-semibold">
                          {source.title.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {/* Content on Right */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Publisher Name */}
                      <span className="text-sm font-medium text-zinc-200 truncate block group-hover:text-zinc-100 transition-colors">
                        {source.title}
                      </span>
                      
                      {/* Description */}
                      {source.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {source.description}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </a>
            );
          })}
      </div>
      </div>

      {/* Right Arrow - Always visible */}
      <button
        className="absolute -right-10 top-[40%] -translate-y-1/2 z-20 cursor-pointer disabled:opacity-30"
        onClick={() => scroll("right")}
        disabled={!canScrollRight}
        aria-label="Scroll right"
      >
        <ChevronRight className="h-8 w-8 text-zinc-400 drop-shadow-lg hover:scale-110 transition-transform" strokeWidth={2.5} />
      </button>
    </div>
  );
}

