export interface Document {
  id: string;
  title: string;
  content: string;
  settings?: string;
  updatedAt: string;
  ownerId?: string;
  sharedWithMe?: boolean;
}
