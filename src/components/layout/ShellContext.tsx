"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface ShellContext {
  open: boolean;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
}

const ShellCtx = createContext<ShellContext>({
  open: false,
  setOpen: () => {},
});

export function useShell() {
  return useContext(ShellCtx);
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function ShellActions() {
  const { setOpen } = useShell();

  const toggle = useCallback(() => setOpen((v) => !v), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  return { toggle, close };
}
