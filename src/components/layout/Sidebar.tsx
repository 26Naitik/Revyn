"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconActivity,
  IconAlertTriangle,
  IconChart,
  IconLogo,
  IconSend,
} from "@/components/ui/icons";
import { ShellActions, useShell } from "@/components/layout/ShellContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: IconChart },
  { href: "/dashboard/risks", label: "Revenue at Risk", icon: IconAlertTriangle },
  { href: "/dashboard/recoveries", label: "Recoveries", icon: IconSend },
  { href: "/dashboard/audit", label: "Audit Trail", icon: IconActivity },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function SidebarContent() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-white">
          <IconLogo className="h-[18px] w-[18px]" />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight text-ink">
            Revyn
          </p>
          <p className="text-[11px] leading-none text-faint">
            Revenue recovery
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-soft text-brand-dark ring-1 ring-inset ring-brand/15"
                  : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  active
                    ? "text-brand"
                    : "text-faint group-hover:text-muted"
                }`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-medium text-ink">Razorpay Test Mode</p>
            <p className="mt-0.5 text-[11px] text-faint">
              Sandbox · safe recovery runs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { open } = useShell();
  const { close } = ShellActions();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={close}
          className={`absolute inset-0 bg-navy/30 backdrop-blur-[2px] transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-64 border-r border-line bg-surface shadow-raised transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent />
        </aside>
      </div>
    </>
  );
}
