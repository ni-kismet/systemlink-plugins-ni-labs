import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { IFileMetadata, IUploadedFile } from '../../models/file.models';
import { FileHttpService } from '../file-http/file-http.service';

/** Business layer for file operations used by template flows. */
@Injectable({
  providedIn: 'root',
})
export class FileService {
  public constructor(private readonly fileHttpService: FileHttpService) {}

  /** Uploads a file and returns the uploaded file metadata. */
  public uploadFile(file: File, workspaceId: string): Observable<IUploadedFile> {
    return this.fileHttpService.uploadFile(file, workspaceId);
  }

  /** Resolves display metadata (name and size) for the given file IDs. */
  public getFilesByIds(ids: string[]): Observable<IFileMetadata[]> {
    return this.fileHttpService.searchFilesByIds(ids).pipe(
      map((files) =>
        files.map((file) => ({
          id: file.id,
          // The File Service returns the file name under the "Name" property (capitalized).
          name: file.properties?.['Name'] ?? file.properties?.['name'] ?? '',
          size: file.size ?? file.size64 ?? 0,
        })),
      ),
    );
  }
}
