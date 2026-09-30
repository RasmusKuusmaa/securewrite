export interface DocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Document extends DocumentMeta {
  content: string;
}

/** One slice of an entry's time, e.g. "Math" 90 minutes inside a 3h
 * "Studies" entry. Parts may sum to less than the entry's total - the
 * remainder counts as time on the activity in general. */
export interface JournalPart {
  name: string;
  minutes: number;
}

export interface JournalEntry {
  /** Empty on a brand new entry - the backend assigns one on save. */
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  activity: string;
  minutes: number;
  parts: JournalPart[];
  note: string;
  createdAt: number;
  updatedAt: number;
}
