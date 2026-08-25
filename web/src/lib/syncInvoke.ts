import * as vault from "./syncVaultService";
import * as documents from "./syncDocumentsService";
import * as settings from "./settingsService";

// Sync-mode counterpart to invoke.ts, same command names so useVault/
// useDocuments don't need to know which backend is active (see backend.ts).
// Settings stay device-local in both modes - not part of the account - so
// they're dispatched to the same settingsService local mode uses.
export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "vault_status":
      return vault.vaultStatus() as Promise<T>;
    case "setup_vault":
      return vault.setupAccount(args.username as string, args.password as string) as Promise<T>;
    case "unlock_with_password":
      return vault.unlockWithPassword(args.username as string, args.password as string) as Promise<T>;
    case "unlock_with_recovery_key":
      return vault.unlockWithRecoveryKey(args.username as string, args.recoveryKey as string) as Promise<T>;
    case "lock_vault":
      return vault.lockVault() as Promise<T>;
    case "logout":
      return vault.logout() as Promise<T>;
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
