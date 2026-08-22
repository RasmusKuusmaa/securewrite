import { useState } from "react";
import { useDocuments } from "../store/useDocuments";
import { useVault } from "../store/useVault";
import SettingsPanel from "./SettingsPanel";

export default function Sidebar() {
  const documents = useDocuments((s) => s.documents);
  const activeDoc = useDocuments((s) => s.activeDoc);
  const openDocument = useDocuments((s) => s.openDocument);
  const createDocument = useDocuments((s) => s.createDocument);
  const renameDocument = useDocuments((s) => s.renameDocument);
  const deleteDocument = useDocuments((s) => s.deleteDocument);
  const lock = useVault((s) => s.lock);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const startEditing = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const commitEditing = async () => {
    const id = editingId;
    setEditingId(null);
    if (id && editingTitle.trim()) {
      await renameDocument(id, editingTitle.trim());
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Documents</span>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => createDocument()}
            title="New document"
          >
            +
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => lock()}
            title="Lock (Ctrl+Shift+L)"
          >
            Lock
          </button>
        </div>
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <ul className="doc-list">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className={`doc-item ${activeDoc?.id === doc.id ? "active" : ""}`}
            onClick={() => editingId !== doc.id && openDocument(doc.id)}
          >
            {editingId === doc.id ? (
              <input
                autoFocus
                className="doc-rename-input"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitEditing}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEditing();
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="doc-title"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditing(doc.id, doc.title);
                }}
              >
                {doc.title || "Untitled"}
              </span>
            )}

            {confirmDeleteId === doc.id ? (
              <span className="doc-delete-confirm">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDocument(doc.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(null);
                  }}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="icon-button doc-delete"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(doc.id);
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
