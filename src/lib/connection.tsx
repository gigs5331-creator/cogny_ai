import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ConnectionStatus = "online" | "offline" | "reconnecting" | "syncing";

type Ctx = {
  status: ConnectionStatus;
  online: boolean;
  lastSyncedAt: string | null;
  setSyncing: (syncing: boolean) => void;
  markSynced: () => void;
};

const ConnectionCtx = createContext<Ctx>({
  status: "online",
  online: true,
  lastSyncedAt: null,
  setSyncing: () => {},
  markSynced: () => {},
});

const LAST_SYNC_KEY = "cogni:last-sync";

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncingState] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setLastSyncedAt(localStorage.getItem(LAST_SYNC_KEY));
    const goOnline = () => {
      setReconnecting(true);
      setOnline(true);
      window.setTimeout(() => setReconnecting(false), 1200);
    };
    const goOffline = () => { setOnline(false); setReconnecting(false); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const markSynced = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, now);
    setLastSyncedAt(now);
  }, []);

  const status: ConnectionStatus = !online ? "offline" : syncing ? "syncing" : reconnecting ? "reconnecting" : "online";

  const value = useMemo(
    () => ({ status, online, lastSyncedAt, setSyncing: setSyncingState, markSynced }),
    [status, online, lastSyncedAt, markSynced],
  );
  return <ConnectionCtx.Provider value={value}>{children}</ConnectionCtx.Provider>;
}

export const useConnection = () => useContext(ConnectionCtx);

/** True when a network-dependent (AI) feature can run right now. */
export function canUseAI() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export const AI_OFFLINE_MESSAGE = "This AI feature requires an internet connection.";
