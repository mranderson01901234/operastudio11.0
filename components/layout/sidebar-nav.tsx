"use client";

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Folder,
  Mail,
  Github,
} from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useFileSystem } from "@/contexts/filesystem-context";
import { SignInModal } from "@/components/auth/sign-in-modal";

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedTool, setSelectedTool } = useFileSystem();
  const { isSignedIn, isLoaded } = useUser();
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [modalToolName, setModalToolName] = useState("");

  const [pendingTool, setPendingTool] = useState<"filesystem" | "email" | "github" | null>(null);

  const handleToolClick = (tool: "filesystem" | "email" | "github", toolName: string) => {
    if (!isLoaded) return; // Wait for auth to load
    
    if (!isSignedIn) {
      setModalToolName(toolName);
      setPendingTool(tool);
      setShowSignInModal(true);
      return;
    }
    
    setSelectedTool(tool);
    router.push("/");
  };

  // Navigate to pending tool when user signs in
  useEffect(() => {
    if (isSignedIn && isLoaded && pendingTool && !showSignInModal) {
      setSelectedTool(pendingTool);
      router.push("/");
      setPendingTool(null);
    }
  }, [isSignedIn, isLoaded, pendingTool, showSignInModal, setSelectedTool, router]);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton 
            size="default" 
            isActive={pathname === "/" && selectedTool === "chat"}
            onClick={() => {
              setSelectedTool("chat");
              router.push("/");
            }}
          >
            <MessageSquare />
            <span>Chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div className="relative flex w-full min-w-0 flex-col p-2">
        <div className="duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2">
          Tools
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              size="default"
              isActive={pathname === "/" && selectedTool === "filesystem"}
              onClick={() => handleToolClick("filesystem", "File System")}
            >
              <Folder />
              <span>File System</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              size="default"
              isActive={pathname === "/" && selectedTool === "email"}
              onClick={() => handleToolClick("email", "Email")}
            >
              <Mail />
              <span>Email</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              size="default"
              isActive={pathname === "/" && selectedTool === "github"}
              onClick={() => handleToolClick("github", "GitHub")}
            >
              <Github />
              <span>GitHub</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
      
      {/* Sign In Modal */}
      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
        toolName={modalToolName}
      />
    </>
  );
}

