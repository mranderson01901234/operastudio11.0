"use client";

import React, { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface EmailBodyProps {
  html?: string;
  text?: string;
}

export function EmailBody({ html, text }: EmailBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !html) return;

    // Function to check if an image is a tracking pixel
    const isTrackingPixel = (img: HTMLImageElement): boolean => {
      const src = img.getAttribute("src") || "";
      return (
        src.includes("medium.com/_/stat") ||
        src.includes("sendgrid.net/wf/open") ||
        src.includes("tracking") ||
        src.includes("pixel") ||
        src.includes("beacon") ||
        src.includes("analytics") ||
        (img.width === 1 && img.height === 1) ||
        (img.width === 0 && img.height === 0) ||
        img.style.width === "1px" ||
        img.style.height === "1px"
      );
    };

    // Function to handle images
    const handleImage = (img: HTMLImageElement) => {
      if (isTrackingPixel(img)) {
        // Hide tracking pixels silently before they try to load
        img.style.display = "none";
        img.style.width = "0";
        img.style.height = "0";
        img.style.visibility = "hidden";
        // Remove src to prevent loading attempt
        img.removeAttribute("src");
      }

      // Add error handler to prevent console errors for any failed images
      img.onerror = () => {
        // Silently handle image load errors
        img.style.display = "none";
      };

      // Prevent images from causing layout shifts
      img.loading = "lazy";
    };

    // Handle existing images
    const images = containerRef.current.querySelectorAll("img");
    images.forEach(handleImage);

    // Use MutationObserver to catch images added dynamically
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if the added node is an image
            if (element.tagName === "IMG") {
              handleImage(element as HTMLImageElement);
            }
            // Check for images within the added node
            const imgs = element.querySelectorAll?.("img");
            if (imgs) {
              imgs.forEach(handleImage);
            }
          }
        });
      });
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [html]);

  if (html) {
    // Filter out tracking pixels before sanitization
    let filteredHtml = html;
    
    // Create a temporary DOM element to parse and filter HTML
    if (typeof window !== "undefined") {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      
      // Find and remove tracking pixels
      const images = tempDiv.querySelectorAll("img");
      images.forEach((img) => {
        const src = img.getAttribute("src") || "";
        const width = img.getAttribute("width") || img.style.width || "";
        const height = img.getAttribute("height") || img.style.height || "";
        
        const isTrackingPixel =
          src.includes("medium.com/_/stat") ||
          src.includes("sendgrid.net/wf/open") ||
          src.includes("tracking") ||
          src.includes("pixel") ||
          src.includes("beacon") ||
          src.includes("analytics") ||
          width === "1" ||
          height === "1" ||
          width === "1px" ||
          height === "1px" ||
          (img.width === 1 && img.height === 1) ||
          (img.width === 0 && img.height === 0);
        
        if (isTrackingPixel) {
          img.remove();
        }
      });
      
      filteredHtml = tempDiv.innerHTML;
    }

    // Sanitize HTML to prevent XSS
    const sanitized = DOMPurify.sanitize(filteredHtml, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "b",
        "i",
        "u",
        "a",
        "ul",
        "ol",
        "li",
        "img",
        "div",
        "span",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "pre",
        "code",
        "table",
        "thead",
        "tbody",
        "tr",
        "td",
        "th",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "style", "width", "height"],
      ALLOW_DATA_ATTR: false,
    });

    return (
      <div
        ref={containerRef}
        className="prose prose-sm max-w-full dark:prose-invert email-content w-full"
        dangerouslySetInnerHTML={{ __html: sanitized }}
        style={{
          wordBreak: "break-word",
          maxWidth: "100%",
          width: "100%",
        }}
      />
    );
  }

  if (text) {
    return (
      <div 
        className="prose prose-sm max-w-full dark:prose-invert whitespace-pre-wrap email-content w-full"
        style={{
          maxWidth: "100%",
          width: "100%",
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground italic">
      No content available
    </div>
  );
}

