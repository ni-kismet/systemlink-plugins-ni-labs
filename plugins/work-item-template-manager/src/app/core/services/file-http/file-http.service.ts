import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { API_ERROR_MESSAGES, API_ROUTES } from '../../constants/api.constants';
import { IServiceFile, ISearchFilesResponse, IUploadedFile } from '../../models/file.models';
import { NotificationBannerService } from '../notification-banner/notification-banner.service';

/** HTTP layer for uploading files to SystemLink File Service. */
@Injectable({
  providedIn: 'root',
})
export class FileHttpService {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly notificationBannerService: NotificationBannerService,
  ) {}

  /** Uploads one file and returns its created file id. */
  public uploadFile(file: File, workspaceId: string): Observable<IUploadedFile> {
    const body = this.createUploadBody(file);
    const url = `${API_ROUTES.uploadFile}?workspace=${encodeURIComponent(workspaceId)}`;

    return this.httpClient.post<unknown>(url, body, { headers: this.createWorkspaceHeaders() }).pipe(
      map((response) => this.normalizeUploadResponse(response, file.name)),
      catchError((error: HttpErrorResponse) => {
        const detail =
          error.status > 0
            ? `${API_ERROR_MESSAGES.failedToUploadNamedFile(file.name)} (HTTP ${error.status})`
            : API_ERROR_MESSAGES.failedToUploadNamedFile(file.name);

        this.notificationBannerService.showError(API_ERROR_MESSAGES.failedToUploadFile, detail);
        return throwError(() => error);
      }),
    );
  }

  /** Resolves file metadata for the given file IDs via the search-files endpoint.
   *  Degrades gracefully to an empty list on failure since it is display-only. */
  public searchFilesByIds(ids: string[]): Observable<IServiceFile[]> {
    const validIds = ids.map((id) => id.trim()).filter((id) => id.length > 0);
    if (validIds.length === 0) {
      return of<IServiceFile[]>([]);
    }

    const filter = `id: (${validIds.map((id) => `"${id}"`).join(' OR ')})`;
    const body = { filter, take: validIds.length };

    return this.httpClient.post<ISearchFilesResponse>(API_ROUTES.searchFiles, body).pipe(
      map((response) => response.availableFiles ?? []),
      catchError(() => of<IServiceFile[]>([])),
    );
  }

  private createUploadBody(file: File): FormData {
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('metadata', '{}');
    return body;
  }

  private createWorkspaceHeaders(): HttpHeaders {
    return new HttpHeaders();
  }

  private normalizeUploadResponse(response: unknown, fallbackName: string): IUploadedFile {
    if (this.isUploadedFile(response)) {
      return {
        id: response.id,
        name: response.name ?? fallbackName,
      };
    }

    if (this.hasUri(response)) {
      const idFromUri = this.extractFileIdFromUri(response.uri);
      if (idFromUri) {
        return {
          id: idFromUri,
          name: fallbackName,
        };
      }
    }

    if (this.hasFile(response)) {
      return response.file;
    }

    if (this.hasFiles(response)) {
      return response.files[0];
    }

    throw new Error('Unexpected file upload response format.');
  }

  private isUploadedFile(value: unknown): value is IUploadedFile {
    return (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof (value as { id: unknown }).id === 'string'
    );
  }

  private hasFile(value: unknown): value is { file: IUploadedFile } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'file' in value &&
      this.isUploadedFile((value as { file: unknown }).file)
    );
  }

  private hasFiles(value: unknown): value is { files: IUploadedFile[] } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'files' in value &&
      Array.isArray((value as { files: unknown }).files) &&
      (value as { files: unknown[] }).files.length > 0 &&
      this.isUploadedFile((value as { files: unknown[] }).files[0])
    );
  }

  private hasUri(value: unknown): value is { uri: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'uri' in value &&
      typeof (value as { uri: unknown }).uri === 'string'
    );
  }

  private extractFileIdFromUri(uri: string): string | null {
    const match = uri.match(/\/files\/([0-9a-fA-F-]+)$/);
    return match ? match[1] : null;
  }
}
