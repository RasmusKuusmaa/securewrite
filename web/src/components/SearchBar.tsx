import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onClose: () => void;
}

export default function SearchBar({ textareaRef, content, onClose }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches: number[] = [];
  if (query) {
    const lower = content.toLowerCase();
    const q = query.toLowerCase();
    let from = 0;
    let idx = lower.indexOf(q, from);
    while (idx !== -1) {
      matches.push(idx);
      from = idx + q.length;
      idx = lower.indexOf(q, from);
    }
  }

  const goTo = (i: number) => {
    if (matches.length === 0) {
      setMatchIndex(-1);
      return;
    }
    const wrapped = ((i % matches.length) + matches.length) % matches.length;
    setMatchIndex(wrapped);
    const start = matches[wrapped];
    const end = start + query.length;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(start, end);
    }
  };

  useEffect(() => {
    if (matches.length > 0) {
      goTo(0);
    } else {
      setMatchIndex(-1);
    }
    // re-run whenever the search text or the document content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, content]);

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goTo(e.shiftKey ? matchIndex - 1 : matchIndex + 1);
          }
          if (e.key === "Escape") {
            onClose();
          }
        }}
        placeholder="Find in document..."
      />
      <span className="search-count">
        {matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : query ? "0/0" : ""}
      </span>
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        onClick={() => goTo(matchIndex - 1)}
        disabled={matches.length === 0}
      >
        ↑
      </button>
      <button
        type="button"
        title="Next match (Enter)"
        onClick={() => goTo(matchIndex + 1)}
        disabled={matches.length === 0}
      >
        ↓
      </button>
      <button type="button" title="Close find (Esc)" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
