import { Sidebar } from "@/components/layout/Sidebar";
import { ShellProvider } from "@/components/layout/ShellContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShellProvider>
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </ShellProvider>
  );
}
