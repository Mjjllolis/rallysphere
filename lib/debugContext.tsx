// lib/debugContext.tsx
// App-wide "Debug logs" preference. Default OFF. When enabled, on-screen
// diagnostic output (e.g. the Finix checkout diag panel) is shown to help
// troubleshoot. Persisted with AsyncStorage, mirroring favoritesContext.
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DebugContextType {
  debugLogs: boolean;
  setDebugLogs: (enabled: boolean) => void;
}

const DebugContext = createContext<DebugContextType>({
  debugLogs: false,
  setDebugLogs: () => {},
});

const DEBUG_STORAGE_KEY = '@rallysphere_debug_logs';

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [debugLogs, setDebugLogsState] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DEBUG_STORAGE_KEY);
        if (v != null) setDebugLogsState(v === 'true');
      } catch { /* ignore */ }
    })();
  }, []);

  const setDebugLogs = (enabled: boolean) => {
    setDebugLogsState(enabled);
    AsyncStorage.setItem(DEBUG_STORAGE_KEY, enabled ? 'true' : 'false').catch(() => {});
  };

  return (
    <DebugContext.Provider value={{ debugLogs, setDebugLogs }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebugLogs() {
  return useContext(DebugContext);
}
