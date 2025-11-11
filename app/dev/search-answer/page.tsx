"use client";

import React from "react";
import { SearchAnswer } from "@/components/search/search-answer";
import type { SearchAnswerPayload } from "@/lib/search/search-result-types";

/**
 * Test harness for SearchAnswer component
 * Access at: /dev/search-answer
 */
export default function SearchAnswerTestPage() {
  const samplePayload: SearchAnswerPayload = {
    query: "whats the latest news in AI",
    mode: "answer",
    sources: [
      {
        url: "https://deadline.com/ai-news",
        title: "Deadline",
        favicon: "https://www.google.com/s2/favicons?domain=deadline.com&sz=32",
        thumbnail: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=200&fit=crop",
        description: "'Pluribus' Creator Vince Gilligan announces new AI-focused series exploring artificial intelligence ethics.",
        tag: "news",
      },
      {
        url: "https://nytimes.com/tech/ai",
        title: "New York Times",
        favicon: "https://www.google.com/s2/favicons?domain=nytimes.com&sz=32",
        thumbnail: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop",
        description: "Debt Has Entered the A.I. Boom - Major tech companies leveraging debt to fund massive AI infrastructure investments.",
      },
      {
        url: "https://crescendo.ai/blog",
        title: "Crescendo AI",
        favicon: "https://www.google.com/s2/favicons?domain=crescendo.ai&sz=32",
        thumbnail: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&h=200&fit=crop",
        description: "The Latest AI News and AI Breakthroughs that Matter - Weekly roundup of the most significant developments in artificial intelligence.",
        tag: "blog",
      },
      {
        url: "https://techcrunch.com/ai",
        title: "TechCrunch",
        favicon: "https://www.google.com/s2/favicons?domain=techcrunch.com&sz=32",
        thumbnail: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=400&h=200&fit=crop",
        description: "Breaking technology news on AI startups, funding rounds, and emerging artificial intelligence applications.",
      },
      {
        url: "https://aimagazine.com",
        title: "AI Magazine",
        favicon: "https://www.google.com/s2/favicons?domain=aimagazine.com&sz=32",
        thumbnail: "https://images.unsplash.com/photo-1655720033654-a4239dd42d10?w=400&h=200&fit=crop",
        description: "Enterprise AI insights covering machine learning deployment, AI governance, and industry adoption trends.",
        tag: "news",
      },
    ],
    sections: [
      {
        heading: "Major Product Launches and Partnerships",
        bullets: [
          {
            text: "OpenAI has released \"Atlas\", a new AI-powered web browser with integrated AI research and automation features, directly challenging Google in the search and browser market.",
            sourceIndex: 2,
          },
          {
            text: "Alibaba has launched Qwen3-Coder, a massive, open-source AI coding model designed to compete globally in software development automation.",
            sourceIndex: 0,
          },
          {
            text: "Major companies like Dell Technologies and NVIDIA are advancing enterprise AI infrastructure, improving data platforms to support rapid AI model deployment and analytics.",
            sourceIndex: 2,
          },
        ],
      },
      {
        heading: "Industry Investments and Expansions",
        bullets: [
          {
            text: "Google is investing $9 billion in new AI data centers in Oklahoma, emphasizing sustainable energy use and support for training large models.",
            sourceIndex: 2,
          },
          {
            text: "Meta has announced massive financial commitments, including plans to spend hundreds of billions of dollars to build large-scale AI data centers and achieve 'superintelligence' goals.",
            sourceIndex: 1,
          },
          {
            text: "AI startup Anthropic is expanding into Europe with new offices in Paris and Munich, tripling its workforce to meet increasing demand for its Claude AI models.",
            sourceIndex: 1,
          },
        ],
      },
      {
        heading: "Global Impact and Trends",
        bullets: [
          {
            text: "AI adoption continues to accelerate across industries, with particular growth in healthcare diagnostics, autonomous systems, and creative tools.",
            sourceIndex: 3,
          },
          {
            text: "Regulatory frameworks are evolving globally, with the EU AI Act setting new standards for responsible AI development and deployment.",
            sourceIndex: 4,
          },
        ],
      },
    ],
    stepsCaption: "Assistant steps",
    followups: [
      "summarize the investments",
      "show only open-source model launches",
      "compare Qwen3-Coder to GitHub Copilot",
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 py-8">
      <div className="max-w-5xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 border-b border-zinc-800 pb-6">
          <h1 className="text-3xl font-bold text-zinc-100">
            Search Answer View Test
          </h1>
          <p className="text-sm text-zinc-400">
            Perplexity-style answer layout component
          </p>
        </div>

        {/* Component */}
        <div className="bg-zinc-900/30 rounded-lg border border-zinc-800 p-4">
          <SearchAnswer payload={samplePayload} />
        </div>

        {/* Info */}
        <div className="text-xs text-zinc-500 text-center space-y-1">
          <p>Test page for search answer component</p>
          <p>Located at: <code className="text-zinc-400">/app/dev/search-answer/page.tsx</code></p>
        </div>
      </div>
    </div>
  );
}

