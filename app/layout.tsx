import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { FileSystemProvider } from "@/contexts/filesystem-context";
import { FileEditorProvider } from "@/contexts/file-editor-context";
import { ChatProvider } from "@/contexts/chat-context";
import { EmailProvider } from "@/contexts/email-context";
import { GitHubProvider } from "@/contexts/github-context";
import { ImagenProvider } from "@/contexts/imagen-context";
import { ImageViewerProvider } from "@/contexts/image-viewer-context";
import { ChatInputProvider } from "@/contexts/chat-input-context";
import { DownloadProvider } from "@/contexts/download-context";
import { WorkingDirectoryProvider } from "@/contexts/working-directory-context";
import { ModelInitProvider } from "@/components/model-init-provider";
import { LogoutCleanup } from "@/components/logout-cleanup";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap', // Prevent FOIT (Flash of Invisible Text)
  preload: true,
  fallback: ['system-ui', 'arial'], // Fallback fonts for better performance
});

export const metadata: Metadata = {
  title: "OperaStudio",
  description: "A frontend for a powerful LLM assistant.",

  // Icons
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
        elements: {
          modalBackdrop: "bg-black/20 backdrop-blur-none",
          modalContent: "bg-background",
        },
      }}
    >
      <html lang="en" className="dark">
        <body className={`${inter.variable} font-body antialiased`}>
          <LogoutCleanup />
          <ChatProvider>
            <FileSystemProvider>
              <FileEditorProvider>
                <EmailProvider>
                  <GitHubProvider>
                    <ImagenProvider>
                      <ImageViewerProvider>
                        <ChatInputProvider>
                          <DownloadProvider>
                            <WorkingDirectoryProvider>
                              <ModelInitProvider>
                            <SidebarProvider>
                              <AppSidebar />
                              <SidebarInset>{children}</SidebarInset>
                            </SidebarProvider>
                            </ModelInitProvider>
                            </WorkingDirectoryProvider>
                          </DownloadProvider>
                        </ChatInputProvider>
                      </ImageViewerProvider>
                    </ImagenProvider>
                  </GitHubProvider>
                </EmailProvider>
              </FileEditorProvider>
            </FileSystemProvider>
          </ChatProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
