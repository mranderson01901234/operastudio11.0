"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Mic, Image, MoreHorizontal } from "lucide-react";

interface FollowUpBarProps {
  suggestions?: string[];
  onSubmit?: (query: string) => void;
}

/**
 * Follow-up input bar with suggestions and quick action icons
 */
export function FollowUpBar({ suggestions, onSubmit }: FollowUpBarProps) {
  const [input, setInput] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && onSubmit) {
      onSubmit(input.trim());
      setInput("");
    }
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };
  
  return (
    <div className="mt-8 space-y-3">
      {/* Suggestions (optional) */}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="text-xs text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
      
      {/* Input Bar */}
      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-center gap-2">
          {/* Text Input */}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up"
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-200 placeholder:text-zinc-600 h-8"
          />
          
          {/* Action Icons */}
          <div className="flex items-center gap-1">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              aria-label="Image search"
            >
              <Image className="h-4 w-4" />
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

