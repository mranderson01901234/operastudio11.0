"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toSentenceCase } from "@/lib/utils";

interface AnswerHeaderProps {
  query: string;
  activeTab: "answer" | "videos" | "listen";
  onTabChange: (tab: "answer" | "videos" | "listen") => void;
}

/**
 * Query title and tab navigation (Answer/Videos/Listen)
 */
export function AnswerHeader({ query, activeTab, onTabChange }: AnswerHeaderProps) {
  // Format query: sentence case, but ensure "AI" is always uppercase
  const formattedQuery = toSentenceCase(query).replace(/\bAi\b/gi, "AI");
  
  return (
    <div className="space-y-3">
      {/* Query Title - Centered and Larger */}
      <h1 className="text-4xl font-semibold tracking-tight text-blue-400 text-center">
        {formattedQuery}
      </h1>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as "answer" | "videos" | "listen")}>
        <TabsList className="bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger value="answer" className="data-[state=active]:bg-zinc-800">
            Answer
          </TabsTrigger>
          <TabsTrigger value="videos" className="data-[state=active]:bg-zinc-800">
            Watch
          </TabsTrigger>
          <TabsTrigger value="listen" className="data-[state=active]:bg-zinc-800">
            Listen
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

