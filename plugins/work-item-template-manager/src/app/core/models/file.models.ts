/** Minimal file resource returned by SystemLink file upload. */
export interface IUploadedFile {
  id: string;
  name?: string;
}

/** File resource returned by the SystemLink File Service search-files endpoint. */
export interface IServiceFile {
  id: string;
  created?: string;
  updated?: string;
  properties?: Record<string, string> | null;
  serviceGroup?: string;
  size?: number;
  size64?: number;
  workspace?: string;
}

/** Response from the File Service search-files endpoint. */
export interface ISearchFilesResponse {
  availableFiles: IServiceFile[];
  totalCount?: { relation: string; value: number };
}

/** Minimal file metadata resolved by ID for display. */
export interface IFileMetadata {
  id: string;
  name: string;
  size: number;
}
