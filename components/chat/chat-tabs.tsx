"use client";

import { X, Plus } from "lucide-react";
import { useChatManager } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ChatTabs() {
  const {
    chats,
    activeChatId,
    switchChat,
    deleteChat,
    createNewChat,
  } = useChatManager();

  if (chats.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/30">
      {chats.map((chat) => {
        const isActive = chat.id === activeChatId;

        return (
          <div
            key={chat.id}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer min-w-0 shrink-0",
              "border",
              isActive
                ? "bg-zinc-800/60 border-zinc-700 text-zinc-100"
                : "bg-zinc-900/40 border-zinc-800/50 text-zinc-400 hover:bg-zinc-800/40 hover:border-zinc-700/50 hover:text-zinc-300"
            )}
            onClick={() => switchChat(chat.id)}
          >
            <span
              className="text-sm truncate max-w-[140px] font-medium"
              title={chat.title}
            >
              {chat.title}
            </span>
            {chats.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 opacity-70 hover:opacity-100 hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                title="Close chat"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
      {/* New Chat Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={createNewChat}
        className="h-8 w-8 shrink-0 rounded-lg border border-zinc-800/50 bg-zinc-900/40 hover:bg-zinc-800/40 hover:border-zinc-700/50 text-zinc-400 hover:text-zinc-300 transition-all"
        title="New Chat"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

