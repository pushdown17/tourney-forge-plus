import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "server_time_offset_ms";

let serverOffsetMs = 0;

const loadOffset = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) serverOffsetMs = parsed;
  } catch {
    // ignore
  }
};

// Initialize from storage once
loadOffset();

export const getServerOffsetMs = () => serverOffsetMs;

export const getSyncedNowMs = () => Date.now() + serverOffsetMs;

export const syncServerTimeOffset = async () => {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc("get_server_time");
    const t1 = Date.now();

    if (error) {
      console.log("[serverTime] get_server_time error", error);
      return serverOffsetMs;
    }

    // Supabase returns timestamptz as ISO string
    const serverMs = new Date(data as any).getTime();
    const clientMidMs = (t0 + t1) / 2;
    const offset = serverMs - clientMidMs;

    if (!Number.isFinite(offset)) {
      console.log("[serverTime] invalid offset", { data, serverMs, clientMidMs, offset });
      return serverOffsetMs;
    }

    serverOffsetMs = offset;

    try {
      localStorage.setItem(STORAGE_KEY, String(offset));
    } catch {
      // ignore
    }

    console.log("[serverTime] synced", { offset, rttMs: t1 - t0 });
    return offset;
  } catch (e) {
    console.log("[serverTime] unexpected error", e);
    return serverOffsetMs;
  }
};
