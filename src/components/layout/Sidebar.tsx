"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/risks", label: "Revenue at Risk" },
  { href: "/dashboard/recoveries", label: "Recoveries" },
  { href: "/dashboard/audit", label: "Audit Trail" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-gray-50">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <h1 className="text-xl font-bold text-gray-900">
          <span className="text-emerald-600">Rev</span>yn
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-6 py-4">
        <p className="text-xs text-gray-500">Razorpay Buildathon 2026</p>
        <p className="text-xs text-gray-500">Track 03: AI Revenue Recovery</p>
      </div>
    </aside>
  );
}
