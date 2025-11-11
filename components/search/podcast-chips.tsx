"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Headphones } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getHighResFavicon } from "@/lib/search/image-utils";
import Image from "next/image";

interface PodcastResult {
  url: string;
  title: string;
  description: string;
  hostname: string;
}

interface PodcastChipsProps {
  podcasts: PodcastResult[];
}

/**
 * Clean HTML tags from text
 */
function cleanHtml(text: string): string {
  if (!text) return "";
  // Remove HTML tags
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Horizontal scrollable row of podcast cards
 * Similar to SourceChips but for podcasts
 */
export function PodcastChips({ podcasts }: PodcastChipsProps) {
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
  }, [podcasts]);

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
  
  if (podcasts.length === 0) {
    return null;
  }
  
  return (
    <div className="relative w-full group/container mb-6">
      {/* Left Arrow */}
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
          {podcasts.map((podcast, idx) => {
            const faviconUrl = getHighResFavicon(podcast.hostname, 64);
            
            return (
              <a
                key={idx}
                href={podcast.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex-shrink-0"
              >
                <Card className="w-[240px] bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 transition-all cursor-pointer overflow-hidden">
                  {/* Horizontal Layout: Logo on left, content on right */}
                  <div className="flex gap-3 p-3">
                    {/* Podcast Icon/Logo on Left */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center overflow-hidden relative">
                      {faviconUrl ? (
                        <>
                          <Image
                            src={faviconUrl}
                            alt={podcast.hostname}
                            width={48}
                            height={48}
                            className="object-contain rounded-lg"
                            unoptimized
                            onError={(e) => {
                              // Hide image on error, show fallback
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) {
                                fallback.style.display = 'flex';
                              }
                            }}
                          />
                          {/* Fallback headphones icon (hidden by default) */}
                          <div className="absolute inset-0 w-full h-full rounded-lg flex items-center justify-center hidden">
                            <Headphones className="w-6 h-6 text-purple-400" />
                          </div>
                        </>
                      ) : (
                        <Headphones className="w-6 h-6 text-purple-400" />
                      )}
                    </div>
                    
                    {/* Content on Right */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Podcast Title */}
                      <span className="text-sm font-medium text-zinc-200 truncate block group-hover:text-zinc-100 transition-colors">
                        {cleanHtml(podcast.title)}
                      </span>
                      
                      {/* Hostname */}
                      <span className="text-xs text-zinc-500 truncate block">
                        {podcast.hostname}
                      </span>
                      
                      {/* Description */}
                      {podcast.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {cleanHtml(podcast.description)}
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

      {/* Right Arrow */}
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

