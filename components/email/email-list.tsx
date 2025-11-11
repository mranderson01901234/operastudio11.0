"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useEmail } from "@/contexts/email-context";
import { useFileSystem } from "@/contexts/filesystem-context";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateAvatar, generateFallbackAvatar } from "@/lib/email/avatar";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export function EmailList() {
  const { state, setActiveEmail, loadEmails, loadMoreEmails, checkEmailAccount } = useEmail();
  const { setSelectedTool } = useFileSystem();
  const { emails, activeEmail, loading, loadingMore, error, folder, hasEmailAccount, hasMore } = state;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkEmailAccount();
  }, [checkEmailAccount]);

  // Note: Initial load is handled by EmailProvider's initialization
  // This effect only handles folder changes after initial mount
  const hasInitializedRef = React.useRef(false);
  useEffect(() => {
    if (hasEmailAccount && hasInitializedRef.current) {
      loadEmails(folder);
    }
    hasInitializedRef.current = true;
  }, [hasEmailAccount, folder, loadEmails]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when user is within 200px of the bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMoreEmails();
    }
  }, [loadingMore, hasMore, loadMoreEmails]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (!hasEmailAccount) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-sidebar-border flex-shrink-0">
          <SidebarMenuButton
            size="default"
            onClick={() => setSelectedTool("chat")}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </SidebarMenuButton>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
          <Mail className="w-12 h-12 text-sidebar-foreground/30" />
          <div className="text-sm text-sidebar-foreground/70 text-center">
            Connect Gmail to view emails
          </div>
          <Button
            onClick={async () => {
              const response = await fetch("/api/email/gmail/connect");
              if (response.ok) {
                const data = await response.json();
                window.location.href = data.authUrl;
              }
            }}
            size="sm"
            className="w-full"
          >
            Connect Gmail
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-sidebar-border flex-shrink-0">
          <SidebarMenuButton
            size="default"
            onClick={() => setSelectedTool("chat")}
            className="w-full justify-start mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </SidebarMenuButton>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  const emailArray = Array.from(emails.values());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0 space-y-2">
        <SidebarMenuButton
          size="default"
          onClick={() => setSelectedTool("chat")}
          className="w-full justify-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Navigation</span>
        </SidebarMenuButton>

        <div className="text-xs font-medium text-sidebar-foreground/70 px-2 pt-2">
          Email
        </div>
        <div className="text-xs text-sidebar-foreground/50 truncate mt-1 px-2">
          {folder.charAt(0).toUpperCase() + folder.slice(1)}
        </div>
      </div>

      {/* Email list */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-2 premium-scrollbar"
      >
        {loading && emailArray.length === 0 ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="ml-2 text-sm text-sidebar-foreground/70">
              Loading...
            </span>
          </div>
        ) : emailArray.length === 0 ? (
          <div className="p-4 text-sm text-sidebar-foreground/70 text-center">
            No emails found
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {emailArray.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  isSelected={activeEmail === email.id}
                  onClick={() => setActiveEmail(email.id)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 pb-2 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMoreEmails}
                  disabled={loadingMore}
                  className="w-full"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface EmailListItemProps {
  email: {
    id: string;
    from: { name: string; email: string };
    subject: string;
    date: Date;
    snippet: string;
    unread: boolean;
  };
  isSelected: boolean;
  onClick: () => void;
}

function EmailListItem({ email, isSelected, onClick }: EmailListItemProps) {
  // Get logo URLs for company domains
  const getLogoUrls = () => {
    const domain = email.from.email.match(/@([^@]+)$/)?.[1]?.toLowerCase();
    if (!domain) return [];
    
    const skipDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "protonmail.com", "mail.com"];
    if (skipDomains.includes(domain)) return [];
    
    return [
      `https://logo.clearbit.com/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    ];
  };

  const logoUrls = getLogoUrls();
  const fallbackAvatar = generateFallbackAvatar(email.from.name, email.from.email);
  
  // Start with logo URL if available, otherwise use fallback
  const [avatarSrc, setAvatarSrc] = useState(() => 
    logoUrls.length > 0 ? logoUrls[0] : fallbackAvatar
  );
  const [logoIndex, setLogoIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  const handleImageError = () => {
    // Try next logo source if available
    if (logoUrls.length > 0 && logoIndex < logoUrls.length - 1) {
      const nextIndex = logoIndex + 1;
      setLogoIndex(nextIndex);
      setAvatarSrc(logoUrls[nextIndex]);
    } else {
      // All logo sources failed, fallback to initials avatar
      if (!hasError) {
        setHasError(true);
        setAvatarSrc(fallbackAvatar);
      }
    }
  };

  // Reset when email changes
  React.useEffect(() => {
    const newLogoUrls = getLogoUrls();
    const newFallback = generateFallbackAvatar(email.from.name, email.from.email);
    if (newLogoUrls.length > 0) {
      setAvatarSrc(newLogoUrls[0]);
      setLogoIndex(0);
      setHasError(false);
    } else {
      setAvatarSrc(newFallback);
      setHasError(false);
    }
  }, [email.id, email.from.email]);

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-sidebar-accent transition-colors",
        isSelected && "bg-sidebar-accent"
      )}
      onClick={onClick}
    >
      <input
        type="checkbox"
        className="mt-1"
        onClick={(e) => e.stopPropagation()}
      />
      <img
        src={avatarSrc}
        alt={email.from.name || email.from.email}
        className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
        onError={handleImageError}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-sm font-medium truncate",
              email.unread && "font-semibold"
            )}
          >
            {email.from.name || email.from.email}
          </span>
          <span className="text-xs text-sidebar-foreground/50 flex-shrink-0">
            {formatDistanceToNow(email.date, { addSuffix: true })}
          </span>
        </div>
        <p
          className={cn(
            "text-sm truncate",
            email.unread
              ? "text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/70"
          )}
        >
          {email.subject || email.snippet}
        </p>
        {email.snippet && email.subject && (
          <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
            {email.snippet}
          </p>
        )}
      </div>
    </div>
  );
}

