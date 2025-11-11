"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { YouTubeVideoCard } from "@/components/chat/youtube-video-card";

interface VideoResult {
  url: string;
  title: string;
  description: string;
}

interface VideoChipsProps {
  videos: VideoResult[];
}

/**
 * Horizontal scrollable row of video cards
 * Similar to SourceChips but for videos
 */
export function VideoChips({ videos }: VideoChipsProps) {
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
  }, [videos]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    
    const cardWidth = 260 + 12; // Card width + gap
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
  
  if (videos.length === 0) {
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
        <div className="flex gap-3 items-stretch">
          {videos.map((video, idx) => (
            <div key={idx} className="flex-shrink-0 w-[260px]">
              <YouTubeVideoCard
                url={video.url}
                title={video.title}
                description={video.description}
              />
            </div>
          ))}
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

