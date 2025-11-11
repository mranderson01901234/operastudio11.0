"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceCard } from "./source-card";
import type { SearchResultItem } from "@/lib/search/search-result-types";

interface SourceCardsProps {
  results: SearchResultItem[];
  maxVisible?: number;
}

/**
 * Horizontal scrollable row of source cards with navigation arrows
 * Shows cards with left/right arrow buttons to scroll through
 */
export function SourceCards({ results, maxVisible = 4 }: SourceCardsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll position to show/hide arrows
  const checkScrollPosition = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    checkScrollPosition();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollPosition);
      // Check on resize
      window.addEventListener("resize", checkScrollPosition);
      return () => {
        container.removeEventListener("scroll", checkScrollPosition);
        window.removeEventListener("resize", checkScrollPosition);
      };
    }
  }, [results]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    
    const cardWidth = 280 + 8; // max-w-[280px] + gap-2 (8px)
    const scrollAmount = cardWidth * 2; // Scroll 2 cards at a time
    
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const newScroll = direction === "left" 
      ? currentScroll - scrollAmount 
      : currentScroll + scrollAmount;
    
    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: "smooth",
    });
  };

  if (results.length === 0) {
    return null;
  }

  // Calculate width to show exactly 4 cards
  // Each card: max-w-[280px] + gap-2 (8px) = 288px per card
  // 4 cards = 4 * 288px - 8px (last gap) = 1144px
  const containerWidth = maxVisible * 288 - 8;

  return (
    <div className="w-full mb-6">
      {/* Wrapper to limit visible area to 4 cards */}
      <div 
        className="relative overflow-hidden"
        style={{ maxWidth: `${containerWidth}px` }}
      >
        {/* Left Arrow */}
        {canScrollLeft && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-accent shadow-md"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Scrollable Container */}
        <div 
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 search-source-cards-scroll scroll-smooth"
          style={{ scrollbarWidth: "thin" }}
        >
          {results.map((result) => (
            <SourceCard key={result.index} result={result} />
          ))}
        </div>

        {/* Right Arrow */}
        {canScrollRight && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-accent shadow-md"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

