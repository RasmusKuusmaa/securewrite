import { create } from "zustand";
import { invoke } from "../lib/backend";
import { useDocuments } from "./useDocuments";

interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  isDecoy: boolean;
  username?: string | null;
}

interface VaultState {
  initialized: boolean;
  unlocked: boolean;
  isDecoy: boolean;
  loading: boolean;
  // Only meaningful in sync mode - the account signed into on the server,
  // shown by SyncUnlockScreen so a locked reload doesn't need it retyped.
  username: string | null;
  checkStatus: () => Promise<void>;
  setup: (password: string, username?: string) => Promise<string>;
  unlockWithPassword: (password: string, username?: string) => Promise<void>;
  unlockWithRecoveryKey: (recoveryKey: string, username?: string) => Promise<void>;
  lock: () => Promise<void>;
  // Sync-only: ends the server session too (lock() only wipes the in-memory
  // key, matching local's "lock" semantics of staying set up).
  logout: () => Promise<void>;
  setupDuressPassword: (duressPassword: string) => Promise<void>;
}

export const useVault = create<VaultState>((set) => ({
  initialized: false,
  unlocked: false,
  isDecoy: false,
  loading: true,
  username: null,

  checkStatus: async () => {
    const status = await invoke<VaultStatus>("vault_status");
    set({
      initialized: status.initialized,
      unlocked: status.unlocked,
      isDecoy: status.isDecoy,
      username: status.username ?? null,
      loading: false,
    });
  },

  setup: async (password: string, username?: string) => {
    const recoveryKey = await invoke<string>("setup_vault", { password, username });
    set({ initialized: true, unlocked: true, isDecoy: false, username: username ?? null });
    return recoveryKey;
  },

  unlockWithPassword: async (password: string, username?: string) => {
    const isDecoy = await invoke<boolean>("unlock_with_password", { password, username });
    set({ unlocked: true, isDecoy, username: username ?? null });
  },

  unlockWithRecoveryKey: async (recoveryKey: string, username?: string) => {
    await invoke("unlock_with_recovery_key", { recoveryKey, username });
    set({ unlocked: true, isDecoy: false, username: username ?? null });
  },

  lock: async () => {
    await useDocuments.getState().saveActive();
    await invoke("lock_vault");
    useDocuments.getState().reset();
    set({ unlocked: false, isDecoy: false });
  },

  logout: async () => {
    await useDocuments.getState().saveActive();
    await invoke("logout");
    useDocuments.getState().reset();
    set({ initialized: false, unlocked: false, isDecoy: false, username: null });
  },

  setupDuressPassword: async (duressPassword: string) => {
    await invoke("setup_duress_password", { duressPassword });
  },
}));
