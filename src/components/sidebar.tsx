"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Brain,
  FolderKanban,
  Settings,
  Bot,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <TooltipProvider>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center border-r border-white/10 bg-black/40 backdrop-blur-xl py-4 lg:w-64">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 px-4 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30">
            <Bot className="h-6 w-6 text-blue-400" />
          </div>
          <span className="hidden lg:block text-lg font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            Jacob
          </span>
        </Link>

        <Separator className="mb-4 w-10 lg:w-48 bg-white/10" />

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 w-full px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="hidden lg:block">{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="lg:hidden">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="hidden lg:block text-xs text-muted-foreground">Online</span>
        </div>
      </aside>
    </TooltipProvider>
  )
}
