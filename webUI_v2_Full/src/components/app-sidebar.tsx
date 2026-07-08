import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Mail, Monitor, ScrollText, Settings } from "lucide-react";

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
import { useT } from "@/lib/i18n";

const items = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/emails", key: "nav.emails", icon: Mail },
  { to: "/viewer", key: "nav.viewer", icon: Monitor },
  { to: "/logs", key: "nav.logs", icon: ScrollText },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const t = useT();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            V
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold">{t("app.name")}</div>
            <div className="text-xs text-muted-foreground">{t("app.subtitle")}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton asChild isActive={isActive(it.to)} tooltip={t(it.key)}>
                    <Link to={it.to} className="flex items-center gap-2">
                      <it.icon className="h-4 w-4" />
                      <span>{t(it.key)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        {t("app.tagline")}
      </SidebarFooter>
    </Sidebar>
  );
}