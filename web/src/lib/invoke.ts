import * as vault from "./vaultService";
import * as documents from "./documentsService";
import * as settings from "./settingsService";

// Stand-in for @tauri-apps/api/core's invoke(), dispatching by the same
// command names the Rust side used. This lets the zustand stores (useVault,
// useDocuments, useSettings) stay near-identical ports of the desktop
// versions - same call sites, same shapes, only the transport changes.
export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "vault_status":
      return vault.vaultStatus() as Promise<T>;
    case "setup_vault":
      return vault.setupVault(args.password as string) as Promise<T>;
    case "unlock_with_password":
      return vault.unlockWithPassword(args.password as string) as Promise<T>;
    case "unlock_with_recovery_key":
      return vault.unlockWithRecoveryKey(args.recoveryKey as string) as Promise<T>;
    case "lock_vault":
      return vault.lockVault() as Promise<T>;
    case "setup_duress_password":
      return vault.setupDuressPassword(args.duressPassword as string) as Promise<T>;
    case "has_duress_configured":
      return vault.hasDuressConfigured() as Promise<T>;
    case "list_documents":
      return documents.listDocuments() as Promise<T>;
    case "create_document":
      return documents.createDocument() as Promise<T>;
    case "get_document":
      return documents.getDocument(args.id as string) as Promise<T>;
    case "save_document":
      return documents.saveDocument(args.id as string, args.title as string, args.content as string) as Promise<T>;
    case "rename_document":
      return documents.renameDocument(args.id as string, args.title as string) as Promise<T>;
    case "delete_document":
      return documents.deleteDocument(args.id as string) as Promise<T>;
    case "get_settings":
      return settings.getSettings() as Promise<T>;
    case "save_settings":
      return settings.saveSettings(args.settings as settings.Settings) as Promise<T>;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}
