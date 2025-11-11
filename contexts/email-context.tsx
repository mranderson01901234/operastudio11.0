"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import { createAppLogger } from "@/lib/utils/logger";

const logger = createAppLogger("Email Context");

export interface Email {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  bcc?: { name: string; email: string }[];
  subject: string;
  date: Date;
  snippet: string;
  unread: boolean;
  labels: string[];
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
  }>;
}

interface EmailState {
  emails: Map<string, Email>;
  activeEmail: string | null;
  selectedEmailIds: Set<string>;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  folder: "inbox" | "sent" | "drafts";
  hasEmailAccount: boolean;
  emailAccountId: string | null;
  nextPageToken: string | null;
  hasMore: boolean;
}

interface EmailContextValue {
  state: EmailState;
  setActiveEmail: (emailId: string | null) => void;
  loadEmails: (folder?: "inbox" | "sent" | "drafts") => Promise<void>;
  loadMoreEmails: () => Promise<void>;
  loadEmail: (emailId: string) => Promise<void>;
  setFolder: (folder: "inbox" | "sent" | "drafts") => void;
  toggleEmailSelection: (emailId: string) => void;
  clearSelection: () => void;
  checkEmailAccount: () => Promise<void>;
  replyToEmail: (emailId: string, message: string) => Promise<void>;
  archiveEmail: (emailId: string) => Promise<void>;
  deleteEmail: (emailId: string) => Promise<void>;
}

const EmailContext = createContext<EmailContextValue | undefined>(undefined);

const STORAGE_KEY_ACTIVE_EMAIL = "operastudio_email_active";
const STORAGE_KEY_FOLDER = "operastudio_email_folder";
const STORAGE_KEY_EMAIL_CACHE = "operastudio_email_cache";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB max cache size

interface CachedEmail {
  email: Email;
  timestamp: number;
  size: number;
}

export function EmailProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  
  // Initialize state from localStorage
  const [emails, setEmails] = useState<Map<string, Email>>(new Map());
  const [activeEmail, setActiveEmailState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_EMAIL) || null;
    }
    return null;
  });
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolderState] = useState<
    "inbox" | "sent" | "drafts"
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_FOLDER);
      if (saved === "inbox" || saved === "sent" || saved === "drafts") {
        return saved;
      }
    }
    return "inbox";
  });
  const [hasEmailAccount, setHasEmailAccount] = useState(false);
  const [emailAccountId, setEmailAccountId] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState<Set<string>>(new Set());

  // Helper functions for email cache
  const getEmailCache = useCallback((): Map<string, CachedEmail> => {
    if (typeof window === "undefined") return new Map();
    
    try {
      const cached = localStorage.getItem(STORAGE_KEY_EMAIL_CACHE);
      if (!cached) return new Map();
      
      const parsed = JSON.parse(cached);
      const cache = new Map<string, CachedEmail>();
      
      // Filter out expired entries and rebuild map
      const now = Date.now();
      let totalSize = 0;
      
      for (const [id, cachedEmail] of Object.entries(parsed)) {
        const cached = cachedEmail as CachedEmail;
        if (now - cached.timestamp < CACHE_EXPIRY_MS) {
          cache.set(id, cached);
          totalSize += cached.size || 0;
        }
      }
      
      // If cache is too large, remove oldest entries
      if (totalSize > MAX_CACHE_SIZE) {
        const entries = Array.from(cache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        cache.clear();
        let currentSize = 0;
        for (const [id, cached] of entries.reverse()) {
          if (currentSize + cached.size < MAX_CACHE_SIZE * 0.8) {
            cache.set(id, cached);
            currentSize += cached.size;
          }
        }
      }
      
      return cache;
    } catch (error) {
      console.error("Error reading email cache:", error);
      return new Map();
    }
  }, []);

  const saveEmailCache = useCallback((email: Email) => {
    if (typeof window === "undefined") return;
    
    try {
      const cache = getEmailCache();
      const size = JSON.stringify(email).length;
      
      cache.set(email.id, {
        email,
        timestamp: Date.now(),
        size,
      });
      
      // Convert to object for localStorage
      const cacheObj: Record<string, CachedEmail> = {};
      cache.forEach((value, key) => {
        cacheObj[key] = value;
      });
      
      localStorage.setItem(STORAGE_KEY_EMAIL_CACHE, JSON.stringify(cacheObj));
    } catch (error) {
      console.error("Error saving email cache:", error);
      // If quota exceeded, clear old cache
      if (error instanceof Error && error.name === "QuotaExceededError") {
        try {
          localStorage.removeItem(STORAGE_KEY_EMAIL_CACHE);
        } catch {}
      }
    }
  }, [getEmailCache]);

  const checkEmailAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/email/account");
      if (response.ok) {
        const data = await response.json();
        setHasEmailAccount(true);
        setEmailAccountId(data.id);
        return true;
      } else {
        setHasEmailAccount(false);
        setEmailAccountId(null);
        return false;
      }
    } catch (err) {
      setHasEmailAccount(false);
      setEmailAccountId(null);
      return false;
    }
  }, []);

  // Restore state on mount
  useEffect(() => {
    let mounted = true;
    
    const initializeEmailState = async () => {
      const hasAccount = await checkEmailAccount();
      if (hasAccount && mounted) {
        // Restore cached emails first for instant display
        const cache = getEmailCache();
        if (cache.size > 0) {
          setEmails((prev) => {
            const next = new Map(prev);
            cache.forEach((cached) => {
              // Only restore if not already in memory
              if (!next.has(cached.email.id)) {
                next.set(cached.email.id, cached.email);
              }
            });
            return next;
          });
        }
        
        // Load emails for the saved folder
        await loadEmails(folder);
        
        // If there's a saved active email, load it after emails are loaded
        if (activeEmail && mounted) {
          // Small delay to ensure emails list is loaded first
          setTimeout(() => {
            if (mounted) {
              loadEmail(activeEmail, true);
            }
          }, 100);
        }
      }
      if (mounted) {
        setIsInitialized(true);
      }
    };

    initializeEmailState();
    
    return () => {
      mounted = false;
    };
  }, []); // Only run on mount

  // Save activeEmail to localStorage when it changes
  useEffect(() => {
    if (isInitialized && typeof window !== "undefined") {
      if (activeEmail) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_EMAIL, activeEmail);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
      }
    }
  }, [activeEmail, isInitialized]);

  // Save folder to localStorage when it changes
  useEffect(() => {
    if (isInitialized && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_FOLDER, folder);
    }
  }, [folder, isInitialized]);

  // Reset all email state when user signs out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Clear all email state
      setEmails(new Map());
      setActiveEmailState(null);
      setSelectedEmailIds(new Set());
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setFolderState("inbox");
      setHasEmailAccount(false);
      setEmailAccountId(null);
      setNextPageToken(null);
      setIsInitialized(false);
      setLoadingEmails(new Set());
      
      // Clear localStorage (logout cleanup should handle this, but ensure it's cleared)
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
        localStorage.removeItem(STORAGE_KEY_FOLDER);
        localStorage.removeItem(STORAGE_KEY_EMAIL_CACHE);
      }
    }
  }, [isSignedIn, isLoaded]);

  const loadEmails = useCallback(
    async (folderParam?: "inbox" | "sent" | "drafts") => {
      const targetFolder = folderParam || folder;
      setLoading(true);
      setError(null);
      setNextPageToken(null);

      try {
        // Load initial 15 emails for fast display
        const queryParams = new URLSearchParams({
          folder: targetFolder,
          maxResults: "15",
        });

        const response = await fetch(`/api/email/list?${queryParams}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load emails");
        }

        const data = await response.json();
        const emailsMap = new Map<string, Email>();

        data.emails.forEach((email: Email) => {
          emailsMap.set(email.id, email);
        });

        setEmails(emailsMap);
        setFolderState(targetFolder);
        setNextPageToken(data.nextPageToken || null);

        // Preload first few emails in background (after a delay)
        // Use setTimeout to avoid dependency issues
        setTimeout(() => {
          const firstFewEmails = Array.from(emailsMap.values()).slice(0, 3);
          firstFewEmails.forEach((email) => {
            // Check if already cached or loaded
            const cache = getEmailCache();
            const existing = emailsMap.get(email.id);
            if (!existing?.html && !cache.has(email.id)) {
              // Preload in background - loadEmail will be available in closure
              // We'll trigger it via setActiveEmail or direct call
              const emailId = email.id;
              fetch(`/api/email/${encodeURIComponent(emailId)}`)
                .then((res) => res.json())
                .then((emailData) => {
                  saveEmailCache(emailData);
                  setEmails((prev) => {
                    const next = new Map(prev);
                    next.set(emailId, emailData);
                    return next;
                  });
                })
                .catch(() => {
                  // Silently fail for preloads
                });
            }
          });
        }, 1000);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load emails";
        setError(errorMessage);
        console.error("Error loading emails:", err);
      } finally {
        setLoading(false);
      }
    },
    [folder, getEmailCache, saveEmailCache]
  );

  const loadMoreEmails = useCallback(async () => {
    if (!nextPageToken || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        folder: folder,
        maxResults: "15",
        pageToken: nextPageToken,
      });

      const response = await fetch(`/api/email/list?${queryParams}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load more emails");
      }

      const data = await response.json();

        setEmails((prev) => {
          const next = new Map(prev);
          data.emails.forEach((email: Email) => {
            next.set(email.id, email);
          });
          return next;
        });

        setNextPageToken(data.nextPageToken || null);
        
        // Preload newly loaded emails in background (after a delay)
        setTimeout(() => {
          const cache = getEmailCache();
          data.emails.slice(0, 2).forEach((email: Email) => {
            const existing = emails.get(email.id);
            if (!existing?.html && !cache.has(email.id)) {
              const emailId = email.id;
              fetch(`/api/email/${encodeURIComponent(emailId)}`)
                .then((res) => res.json())
                .then((emailData) => {
                  saveEmailCache(emailData);
                  setEmails((prev) => {
                    const next = new Map(prev);
                    next.set(emailId, emailData);
                    return next;
                  });
                })
                .catch(() => {
                  // Silently fail for preloads
                });
            }
          });
        }, 500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load more emails";
      setError(errorMessage);
      console.error("Error loading more emails:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, folder, loadingMore, emails, getEmailCache, saveEmailCache]);

  const loadEmail = useCallback(async (emailId: string, useCache: boolean = true) => {
    // Validate email ID
    if (!emailId || emailId === "undefined" || emailId === "null") {
      console.error("[Email Context] Invalid email ID:", emailId);
      setError(`Invalid email ID: ${emailId}`);
      return;
    }

    // Check if email is already loaded in memory
    const existingEmail = emails.get(emailId);
    if (existingEmail && existingEmail.html !== undefined) {
      setActiveEmailState(emailId);
      return;
    }

    // Check cache first
    if (useCache) {
      const cache = getEmailCache();
      const cached = cache.get(emailId);
      if (cached) {
        // Show cached content immediately
        setEmails((prev) => {
          const next = new Map(prev);
          next.set(emailId, cached.email);
          return next;
        });
        setActiveEmailState(emailId);
        
        // Load fresh content in background (don't wait)
        loadEmail(emailId, false).catch(() => {
          // Silently fail - cached content is already shown
        });
        return;
      }
    }

    // Prevent duplicate loads
    if (loadingEmails.has(emailId)) {
      return;
    }

    setLoadingEmails((prev) => new Set(prev).add(emailId));
    setLoading(true);
    setError(null);

    try {
      logger.debug("Loading email:", emailId);
      const response = await fetch(`/api/email/${encodeURIComponent(emailId)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load email");
      }

      const emailData = await response.json();

      // Save to cache
      saveEmailCache(emailData);

      setEmails((prev) => {
        const next = new Map(prev);
        next.set(emailId, emailData);
        return next;
      });

      setActiveEmailState(emailId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load email";
      setError(errorMessage);
      console.error("Error loading email:", err);
    } finally {
      setLoading(false);
      setLoadingEmails((prev) => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  }, [emails, getEmailCache, saveEmailCache, loadingEmails]);

  const setActiveEmail = useCallback((emailId: string | null) => {
    setActiveEmailState(emailId);
    if (emailId) {
      loadEmail(emailId);
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_EMAIL);
    }
  }, [loadEmail]);

  const toggleEmailSelection = useCallback((emailId: string) => {
    setSelectedEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEmailIds(new Set());
  }, []);

  const setFolder = useCallback((newFolder: "inbox" | "sent" | "drafts") => {
    setFolderState(newFolder);
    loadEmails(newFolder);
  }, [loadEmails]);

  const replyToEmail = useCallback(async (emailId: string, message: string) => {
    const email = emails.get(emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    try {
      const response = await fetch("/api/email/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId,
          message,
          threadId: email.threadId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send reply");
      }

      // Reload emails to show the sent reply
      await loadEmails(folder);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send reply";
      setError(errorMessage);
      throw err;
    }
  }, [emails, folder, loadEmails]);

  const archiveEmail = useCallback(async (emailId: string) => {
    try {
      const response = await fetch("/api/email/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to archive email");
      }

      // Remove email from current list if in inbox
      if (folder === "inbox") {
        setEmails((prev) => {
          const next = new Map(prev);
          next.delete(emailId);
          return next;
        });

        // Clear active email if it was archived
        if (activeEmail === emailId) {
          setActiveEmailState(null);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to archive email";
      setError(errorMessage);
      throw err;
    }
  }, [folder, activeEmail]);

  const deleteEmail = useCallback(async (emailId: string) => {
    try {
      const response = await fetch("/api/email/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete email");
      }

      // Remove email from current list
      setEmails((prev) => {
        const next = new Map(prev);
        next.delete(emailId);
        return next;
      });

      // Clear active email if it was deleted
      if (activeEmail === emailId) {
        setActiveEmailState(null);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete email";
      setError(errorMessage);
      throw err;
    }
  }, [activeEmail]);

  const value: EmailContextValue = {
    state: {
      emails,
      activeEmail,
      selectedEmailIds,
      loading,
      loadingMore,
      error,
      folder,
      hasEmailAccount,
      emailAccountId,
      nextPageToken,
      hasMore: nextPageToken !== null,
    },
    setActiveEmail,
    loadEmails,
    loadMoreEmails,
    loadEmail,
    setFolder,
    toggleEmailSelection,
    clearSelection,
    checkEmailAccount,
    replyToEmail,
    archiveEmail,
    deleteEmail,
  };

  return <EmailContext.Provider value={value}>{children}</EmailContext.Provider>;
}

export function useEmail() {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error("useEmail must be used within EmailProvider");
  }
  return context;
}

