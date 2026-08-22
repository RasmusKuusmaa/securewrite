import { create } from "zustand";
import { invoke } from "../lib/invoke";
import type { Document, DocumentMeta } from "../types";

interface DocumentsState {
  documents: DocumentMeta[];
  activeDoc: Document | null;
  loading: boolean;
  saving: boolean;
  init: () => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  createDocument: () => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  setActiveContent: (content: string) => void;
  setActiveTitle: (title: string) => void;
  saveActive: () => Promise<void>;
  reset: () => void;
}

let initPromise: Promise<void> | null = null;

export const useDocuments = create<DocumentsState>((set, get) => ({
  documents: [],
  activeDoc: null,
  loading: true,
  saving: false,

  // Guarded against concurrent calls (e.g. React StrictMode double-invoking
  // the mount effect) so we never race two "no documents yet" reads into
  // creating two first documents.
  init: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      set({ loading: true });
      let documents = await invoke<DocumentMeta[]>("list_documents");
      if (documents.length === 0) {
        const doc = await invoke<Document>("create_document");
        documents = await invoke<DocumentMeta[]>("list_documents");
        set({ documents, activeDoc: doc, loading: false });
        return;
      }
      const first = await invoke<Document>("get_document", { id: documents[0].id });
      set({ documents, activeDoc: first, loading: false });
    })();
    return initPromise;
  },

  openDocument: async (id: string) => {
    // flush any pending edits on the currently open document first
    await get().saveActive();
    const doc = await invoke<Document>("get_document", { id });
    set({ activeDoc: doc });
  },

  createDocument: async () => {
    await get().saveActive();
    const doc = await invoke<Document>("create_document");
    const documents = await invoke<DocumentMeta[]>("list_documents");
    set({ documents, activeDoc: doc });
  },

  renameDocument: async (id: string, title: string) => {
    await invoke("rename_document", { id, title });
    const documents = await invoke<DocumentMeta[]>("list_documents");
    set((state) => ({
      documents,
      activeDoc:
        state.activeDoc?.id === id ? { ...state.activeDoc, title } : state.activeDoc,
    }));
  },

  deleteDocument: async (id: string) => {
    await invoke("delete_document", { id });
    let documents = await invoke<DocumentMeta[]>("list_documents");
    const state = get();
    if (state.activeDoc?.id === id) {
      if (documents.length === 0) {
        const doc = await invoke<Document>("create_document");
        documents = await invoke<DocumentMeta[]>("list_documents");
        set({ documents, activeDoc: doc });
      } else {
        const next = await invoke<Document>("get_document", { id: documents[0].id });
        set({ documents, activeDoc: next });
      }
    } else {
      set({ documents });
    }
  },

  setActiveContent: (content: string) => {
    set((state) => (state.activeDoc ? { activeDoc: { ...state.activeDoc, content } } : {}));
  },

  setActiveTitle: (title: string) => {
    set((state) => (state.activeDoc ? { activeDoc: { ...state.activeDoc, title } } : {}));
  },

  saveActive: async () => {
    const { activeDoc } = get();
    if (!activeDoc) return;
    set({ saving: true });
    const updatedAt = await invoke<number>("save_document", {
      id: activeDoc.id,
      title: activeDoc.title,
      content: activeDoc.content,
    });
    set((state) => ({
      saving: false,
      activeDoc: state.activeDoc ? { ...state.activeDoc, updatedAt } : state.activeDoc,
      documents: state.documents
        .map((d) => (d.id === activeDoc.id ? { ...d, title: activeDoc.title, updatedAt } : d))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  },

  // Called on lock: drop cached plaintext from JS memory and allow init()
  // to run again on the next unlock instead of returning its stale promise.
  reset: () => {
    initPromise = null;
    set({ documents: [], activeDoc: null, loading: true, saving: false });
  },
}));
