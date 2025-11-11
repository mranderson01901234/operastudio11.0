"use client";

import React, { useState, useRef, useEffect } from "react";
import { useEmail } from "@/contexts/email-context";
import { EmailBody } from "./email-body";
import { generateAvatar, generateFallbackAvatar } from "@/lib/email/avatar";
import { format } from "date-fns";
import { Loader2, Download, Reply, Archive, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function EmailViewer() {
  const { state, replyToEmail, archiveEmail, deleteEmail } = useEmail();
  const { activeEmail, emails, loading } = state;
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [deleteButtonWidth, setDeleteButtonWidth] = useState<number | undefined>(undefined);

  const email = activeEmail ? emails.get(activeEmail) : null;

  // Measure width on mount and when email changes
  useEffect(() => {
    if (deleteButtonRef.current && !showDeleteConfirm) {
      const width = deleteButtonRef.current.offsetWidth;
      setDeleteButtonWidth(width);
    }
  }, [activeEmail]);

  if (!activeEmail) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Select an email to view</p>
        </div>
      </div>
    );
  }

  if (loading && !email?.html && !email?.text) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Email not found</p>
        </div>
      </div>
    );
  }

  const getLogoUrls = (emailData: typeof email) => {
    if (!emailData) return [];
    const domain = emailData.from.email.match(/@([^@]+)$/)?.[1]?.toLowerCase();
    if (!domain) return [];
    
    const skipDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "protonmail.com", "mail.com"];
    if (skipDomains.includes(domain)) return [];
    
    return [
      `https://logo.clearbit.com/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    ];
  };

  const logoUrls = getLogoUrls(email);
  const fallbackAvatar = email ? generateFallbackAvatar(email.from.name, email.from.email) : "";
  
  const [avatarSrc, setAvatarSrc] = useState(() => 
    logoUrls.length > 0 ? logoUrls[0] : fallbackAvatar
  );
  const [logoIndex, setLogoIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  // Reset avatar when email changes
  useEffect(() => {
    if (email) {
      const newLogoUrls = getLogoUrls(email);
      const newFallback = generateFallbackAvatar(email.from.name, email.from.email);
      if (newLogoUrls.length > 0) {
        setAvatarSrc(newLogoUrls[0]);
        setLogoIndex(0);
        setHasError(false);
      } else {
        setAvatarSrc(newFallback);
        setHasError(false);
      }
    }
  }, [email?.id]);

  const handleImageError = () => {
    if (!email) return;
    
    const currentLogoUrls = getLogoUrls(email);
    // Try next logo source if available
    if (currentLogoUrls.length > 0 && logoIndex < currentLogoUrls.length - 1) {
      const nextIndex = logoIndex + 1;
      setLogoIndex(nextIndex);
      setAvatarSrc(currentLogoUrls[nextIndex]);
    } else {
      // All logo sources failed, fallback to initials avatar
      if (!hasError) {
        setHasError(true);
        const fallback = generateFallbackAvatar(email.from.name, email.from.email);
        setAvatarSrc(fallback);
      }
    }
  };

  const handleReply = async () => {
    if (!replyMessage.trim() || !activeEmail) return;

    setIsSendingReply(true);
    try {
      await replyToEmail(activeEmail, replyMessage);
      setShowReplyDialog(false);
      setReplyMessage("");
    } catch (error) {
      console.error("Failed to send reply:", error);
      // Error is already set in context
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleArchive = async () => {
    if (!activeEmail) return;

    setIsArchiving(true);
    try {
      await archiveEmail(activeEmail);
    } catch (error) {
      console.error("Failed to archive email:", error);
      // Error is already set in context
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteClick = () => {
    // Measure width before changing state to prevent jump
    if (deleteButtonRef.current) {
      const width = deleteButtonRef.current.offsetWidth;
      setDeleteButtonWidth(width);
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeEmail) return;

    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      await deleteEmail(activeEmail);
    } catch (error) {
      console.error("Failed to delete email:", error);
      // Error is already set in context
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Email header */}
      <div className="border-b p-6 space-y-4 flex-shrink-0 w-full">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold flex-1 min-w-0">{email.subject}</h1>
          <div className="flex gap-2 flex-shrink-0" style={{ minWidth: deleteButtonWidth ? `${deleteButtonWidth}px` : undefined }}>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowReplyDialog(true)}
              disabled={isSendingReply || isArchiving || isDeleting}
            >
              <Reply className="w-4 h-4 mr-2" />
              Reply
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleArchive}
              disabled={isSendingReply || isArchiving || isDeleting}
            >
              {isArchiving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Archiving...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive
                </>
              )}
            </Button>
            {showDeleteConfirm ? (
              <div 
                className="flex gap-2 inline-flex" 
                style={{ 
                  width: deleteButtonWidth ? `${deleteButtonWidth}px` : undefined,
                }}
              >
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDeleteConfirm}
                  disabled={isSendingReply || isArchiving || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex-1"
                  style={{ minWidth: 0 }}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Yes"
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDeleteCancel}
                  disabled={isSendingReply || isArchiving || isDeleting}
                  className="flex-1"
                  style={{ minWidth: 0 }}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button 
                ref={deleteButtonRef}
                variant="outline" 
                size="sm"
                onClick={handleDeleteClick}
                disabled={isSendingReply || isArchiving || isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <img
            src={avatarSrc}
            alt={email.from.name || email.from.email}
            className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
            onError={handleImageError}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">
                {email.from.name || email.from.email}
              </span>
              <span className="text-sm text-muted-foreground">
                &lt;{email.from.email}&gt;
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              To: {email.to.map((t) => t.name || t.email).join(", ")}
            </div>
            {email.cc && email.cc.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Cc: {email.cc.map((c) => c.name || c.email).join(", ")}
              </div>
            )}
            <div className="text-sm text-muted-foreground mt-1">
              {format(email.date, "PPpp")}
            </div>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="flex-1 overflow-auto p-6 w-full premium-scrollbar" style={{ contain: 'layout' }}>
        <div className="w-full max-w-full">
          <EmailBody html={email.html} text={email.text} />
        </div>
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div className="border-t p-4 flex-shrink-0">
          <div className="text-sm font-medium mb-2">Attachments</div>
          <div className="space-y-2">
            {email.attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 border rounded-md hover:bg-accent cursor-pointer"
              >
                <Download className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {attachment.filename}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {attachment.contentType} •{" "}
                    {formatBytes(attachment.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reply Dialog */}
      {showReplyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Reply to {email.from.name || email.from.email}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReplyDialog(false);
                  setReplyMessage("");
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4 premium-scrollbar">
              <div className="mb-4">
                <div className="text-sm text-muted-foreground mb-2">
                  <div>To: {email.from.name || email.from.email} &lt;{email.from.email}&gt;</div>
                  <div>Subject: Re: {email.subject}</div>
                </div>
              </div>
              <Textarea
                placeholder="Type your reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="min-h-[200px]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReplyDialog(false);
                  setReplyMessage("");
                }}
                disabled={isSendingReply}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReply}
                disabled={!replyMessage.trim() || isSendingReply}
              >
                {isSendingReply ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Reply className="w-4 h-4 mr-2" />
                    Send Reply
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

