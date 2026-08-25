import { invoke as localInvoke } from "./invoke";
import { invoke as syncInvoke } from "./syncInvoke";
import { useBackendMode } from "../store/useBackendMode";

// Mode-aware facade in front of invoke.ts (local, IndexedDB) and
// syncInvoke.ts (account/sync, via ../../server) - the only import change
// the zustand stores need, since both sides share the same command names.
export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const mode = useBackendMode.getState().mode;
  return mode === "sync" ? syncInvoke<T>(cmd, args) : localInvoke<T>(cmd, args);
}
