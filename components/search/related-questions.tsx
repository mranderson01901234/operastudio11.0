"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface RelatedQuestionsProps {
  questions: string[];
  onQuestionClick?: (question: string) => void;
}

/**
 * Related questions section
 * Shows suggested follow-up questions with arrow icons
 */
export function RelatedQuestions({
  questions,
  onQuestionClick,
}: RelatedQuestionsProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 pt-6 border-t border-border">
      <h3 className="text-base font-semibold text-foreground mb-4">Related</h3>
      <ul className="space-y-3">
        {questions.map((question, index) => (
          <li key={index}>
            <button
              onClick={() => onQuestionClick?.(question)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left group"
            >
              <ArrowRight className="w-4 h-4 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
              <span className="flex-1">{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

