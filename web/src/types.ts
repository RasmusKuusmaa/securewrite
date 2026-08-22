export interface DocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Document extends DocumentMeta {
  content: string;
}
