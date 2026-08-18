"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  FolderKanban,
  GraduationCap,
  Layers,
  LayoutDashboard,
  MessageCircleQuestion,
  MessagesSquare,
  ScrollText,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { RoleKey } from "@/db/schema";
import { UserMenu } from "@/components/layout/user-menu";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: RoleKey[];
  exact?: boolean;
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Utama",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Pengetahuan",
    items: [
      { title: "FAQ", href: "/knowledge/faq", icon: BookOpen },
      { title: "Kategori", href: "/knowledge/categories", icon: FolderKanban },
      { title: "Sumber", href: "/knowledge/sources", icon: Layers },
    ],
  },
  {
    label: "Operasional",
    items: [
      {
        title: "Tak Terjawab",
        href: "/unanswered",
        icon: MessageQuestionIcon,
        roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
      },
      {
        title: "Percakapan",
        href: "/conversations",
        icon: MessagesSquare,
        roles: ["SUPER_ADMIN", "ADMIN"],
      },
      {
        title: "Handoff Manusia",
        href: "/handoff",
        icon: UserCheck,
        roles: ["SUPER_ADMIN", "ADMIN"],
      },
    ],
  },
  {
    label: "Pengelolaan",
    items: [
      { title: "Analitik", href: "/analytics", icon: BarChart3 },
      {
        title: "Audit Log",
        href: "/audit",
        icon: ScrollText,
        roles: ["SUPER_ADMIN"],
      },
      {
        title: "Pengguna",
        href: "/users",
        icon: Users,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
];

function MessageQuestionIcon(props: { className?: string }) {
  return <MessageCircleQuestion {...props} />;
}

export function AppSidebar({
  roleKey,
  name,
  email,
}: {
  roleKey: RoleKey;
  name: string;
  email: string;
}) {
  const pathname = usePathname();

  const visible = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.roles || item.roles.includes(roleKey),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <GraduationCap className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">BAAK AI</span>
                  <span className="text-xs text-muted-foreground">
                    Knowledge & Admin
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visible.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link href={item.href} className={cn(active && "font-medium")}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu roleKey={roleKey} name={name} email={email} />
      </SidebarFooter>
    </Sidebar>
  );
}
