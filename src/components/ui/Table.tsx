import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function TableShell({
  children,
  minWidth = 720,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth }}
        >
          {children}
        </table>
      </div>
    </Card>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-canvas/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-faint ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  title,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`border-b border-line/60 px-5 py-3.5 align-middle ${
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="transition-colors last:[&>td]:border-b-0 hover:bg-canvas/60">
      {children}
    </tr>
  );
}
