"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { ImageAttachment } from "@/lib/types/chat";

interface ChatInputContextValue {
  attachments: ImageAttachment[];
  addAttachment: (attachment: ImageAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

const ChatInputContext = createContext<ChatInputContextValue | null>(null);

export function ChatInputProvider({ children }: { children: ReactNode }) {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);

  const addAttachment = useCallback((attachment: ImageAttachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return (
    <ChatInputContext.Provider
      value={{
        attachments,
        addAttachment,
        removeAttachment,
        clearAttachments,
      }}
    >
      {children}
    </ChatInputContext.Provider>
  );
}

export function useChatInput() {
  const context = useContext(ChatInputContext);
  if (!context) {
    throw new Error("useChatInput must be used within ChatInputProvider");
  }
  return context;
}

