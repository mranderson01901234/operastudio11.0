"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface Chat {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    content: string;
    role: "assistant" | "user" | "system";
    status?: "streaming" | "complete" | "error";
    metadata?: Record<string, unknown>;
    toolCalls?: Array<{
      id: string;
      name: string;
      status: "executing" | "completed" | "error";
      result?: unknown;
      error?: string;
    }>;
  }>;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "operastudio_chats";
const MAX_TITLE_LENGTH = 50;

/**
 * Generate a short title from the first user message
 */
function generateTitle(firstMessage: string): string {
  // Remove markdown formatting
  let cleaned = firstMessage
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "");

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Take first sentence or first MAX_TITLE_LENGTH characters
  const firstSentence = cleaned.split(/[.!?]\s+/)[0];
  if (firstSentence.length <= MAX_TITLE_LENGTH) {
    return firstSentence || "New Chat";
  }

  // Truncate to MAX_TITLE_LENGTH and add ellipsis
  return cleaned.slice(0, MAX_TITLE_LENGTH).trim() + "...";
}

interface ChatContextType {
  chats: Chat[];
  activeChat: Chat | null;
  activeChatId: string | null;
  createNewChat: () => string;
  switchChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  updateChatMessages: (chatId: string, messages: Chat["messages"]) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Updated welcome message content
  const WELCOME_MESSAGE = `Welcome to OperaStudio! I can help you work with files, emails, GitHub repositories, and generate images. Select a tool from the sidebar to get started.`;

  // Load chats from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Chat[];
        // Remove welcome messages from existing chats
        const updatedChats = parsed.map(chat => {
          const firstMessage = chat.messages[0];
          // Remove welcome messages
          if (firstMessage && 
              firstMessage.role === "assistant" && 
              (firstMessage.content.includes("Welcome to NovaMind") || 
               firstMessage.content.includes("Welcome to OperaStudio"))) {
            return {
              ...chat,
              messages: chat.messages.slice(1),
            };
          }
          return chat;
        });
        setChats(updatedChats);
        
        // Set active chat to the most recently updated one
        if (updatedChats.length > 0) {
          const mostRecent = updatedChats.reduce((latest, chat) =>
            chat.updatedAt > latest.updatedAt ? chat : latest
          );
          setActiveChatId(mostRecent.id);
        }
      } else {
        // Create initial chat if none exist (no welcome message)
        const initialChat: Chat = {
          id: `chat_${Date.now()}`,
          title: "New Chat",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setChats([initialChat]);
        setActiveChatId(initialChat.id);
      }
    } catch (error) {
      console.error("Failed to load chats from localStorage:", error);
      // Create a default chat on error (no welcome message)
      const defaultChat: Chat = {
        id: `chat_${Date.now()}`,
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChats([defaultChat]);
      setActiveChatId(defaultChat.id);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (isInitialized && chats.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
      } catch (error) {
        console.error("Failed to save chats to localStorage:", error);
      }
    }
  }, [chats, isInitialized]);

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: `chat_${Date.now()}`,
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setChats((prev) => [...prev, newChat]);
    setActiveChatId(newChat.id);
    return newChat.id;
  }, []);

  const switchChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setChats((prev) => {
      const filtered = prev.filter((chat) => chat.id !== chatId);
      
      // If we deleted the active chat, switch to another one
      if (chatId === activeChatId) {
        if (filtered.length > 0) {
          // Switch to most recent chat
          const mostRecent = filtered.reduce((latest, chat) =>
            chat.updatedAt > latest.updatedAt ? chat : latest
          );
          setActiveChatId(mostRecent.id);
        } else {
          // Create a new chat if none remain
          const newChat: Chat = {
            id: `chat_${Date.now()}`,
            title: "New Chat",
            messages: [
              {
                id: `msg_${Date.now()}`,
                content: WELCOME_MESSAGE,
                role: "assistant",
                status: "complete",
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setActiveChatId(newChat.id);
          return [newChat];
        }
      }
      
      return filtered;
    });
  }, [activeChatId]);

  const updateChatTitle = useCallback((chatId: string, title: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, title: title.trim() || "New Chat" } : chat
      )
    );
  }, []);

  const updateChatMessages = useCallback(
    (chatId: string, messages: Chat["messages"]) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            // Auto-generate title from first user message if title is still "New Chat"
            let newTitle = chat.title;
            if (chat.title === "New Chat" || chat.title === "") {
              const firstUserMessage = messages.find((msg) => msg.role === "user");
              if (firstUserMessage) {
                newTitle = generateTitle(firstUserMessage.content);
              }
            }

            return {
              ...chat,
              messages,
              title: newTitle,
              updatedAt: Date.now(),
            };
          }
          return chat;
        })
      );
    },
    []
  );

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChat,
        activeChatId,
        createNewChat,
        switchChat,
        deleteChat,
        updateChatTitle,
        updateChatMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatManager() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatManager must be used within a ChatProvider");
  }
  return context;
}

