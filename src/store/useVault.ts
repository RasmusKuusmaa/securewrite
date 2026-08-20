import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useDocuments } from "./useDocuments";

interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

interface VaultState {
  initialized: boolean;
  unlocked: boolean;
  loading: boolean;
  checkStatus: () => Promise<void>;
  setup: (password: string) => Promise<string>;
  unlockWithPassword: (password: string) => Promise<void>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<void>;
  lock: () => Promise<void>;
}

export const useVault = create<VaultState>((set) => ({
  initialized: false,
  unlocked: false,
  loading: true,

  checkStatus: async () => {
    const status = await invoke<VaultStatus>("vault_status");
    set({ initialized: status.initialized, unlocked: status.unlocked, loading: false });
  },

  setup: async (password: string) => {
    const recoveryKey = await invoke<string>("setup_vault", { password });
    set({ initialized: true, unlocked: true });
    return recoveryKey;
  },

  unlockWithPassword: async (password: string) => {
    await invoke("unlock_with_password", { password });
    set({ unlocked: true });
  },

  unlockWithRecoveryKey: async (recoveryKey: string) => {
    await invoke("unlock_with_recovery_key", { recoveryKey });
    set({ unlocked: true });
  },

  lock: async () => {
    await useDocuments.getState().saveActive();
    await invoke("lock_vault");
    useDocuments.getState().reset();
    set({ unlocked: false });
  },
}));
