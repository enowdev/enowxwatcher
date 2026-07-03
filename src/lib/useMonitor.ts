import { useEffect, useState } from "react";
import { api, onMetrics, type Vps, type VpsStatus } from "./api.ts";

// Subscribes to live metrics + the VPS list. Used by both windows.
export function useMonitor() {
  const [vpses, setVpses] = useState<Vps[]>([]);
  const [statuses, setStatuses] = useState<Record<string, VpsStatus>>({});

  async function reloadVpses() {
    try {
      setVpses(await api.listVps());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    reloadVpses();
    // seed from whatever the poller already has
    api.getStatuses().then((list) => {
      setStatuses(Object.fromEntries(list.map((s) => [s.vps_id, s])));
    });
    const un = onMetrics((list) => {
      setStatuses(Object.fromEntries(list.map((s) => [s.vps_id, s])));
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  return { vpses, statuses, reloadVpses };
}
