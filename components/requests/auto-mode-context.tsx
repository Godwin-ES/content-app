"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AutoModeState {
  running: boolean;
  setRunning: (running: boolean) => void;
}

const AutoModeContext = createContext<AutoModeState>({ running: false, setRunning: () => {} });

/**
 * Whether auto mode is currently stepping this request forward.
 *
 * Shared so the rest of the workspace can stand down while it runs. Auto
 * mode and, say, a manual "Start research" both drive the same pipeline;
 * letting someone press one while the other is mid-step invites two
 * writers on one request, and the resulting mess is the kind that is
 * obvious afterwards and invisible at the time.
 *
 * Client state rather than anything persisted: the loop lives in the
 * browser, so closing the page stops the run and there is nothing to
 * unwind. A second tab does not see it, which is a real gap — but the
 * server's own guards (an active operation run, a status check) are what
 * actually prevent the damage; this only stops the obvious mistake.
 */
export function AutoModeProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const value = useMemo(() => ({ running, setRunning }), [running]);
  return <AutoModeContext.Provider value={value}>{children}</AutoModeContext.Provider>;
}

export function useAutoMode(): AutoModeState {
  return useContext(AutoModeContext);
}
