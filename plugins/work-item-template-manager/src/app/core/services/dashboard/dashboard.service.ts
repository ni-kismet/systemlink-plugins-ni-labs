import { Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { IDashboardSearchItem } from '../../models/dashboard.models';
import { AuthService } from '../auth/auth.service';
import { DashboardHttpService } from '../dashboard-http/dashboard-http.service';

/** Business logic layer for dashboard operations. */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  /** Creates an instance of DashboardService. */
  public constructor(
    private readonly dashboardHttpService: DashboardHttpService,
    private readonly authService: AuthService,
  ) {}

  /** Fetches dashboards from the workspace folder and Default Dashboards, then sorts by title. */
  public queryDashboardsByWorkspaceId(workspaceId: string): Observable<IDashboardSearchItem[]> {
    if (!workspaceId) {
      return of([]);
    }

    return this.authService.getAllWorkspaces().pipe(
      map((response) => response.workspaces.find((workspace) => workspace.id === workspaceId)?.name?.trim()),
      switchMap((workspaceName) => {
        if (!workspaceName) {
          return of([]);
        }

        const expectedWorkspaceFolderTitle = `${workspaceName} Workspace`;
        const defaultFolderTitle = 'Default Dashboards';

        return this.dashboardHttpService.queryDashboardFolders().pipe(
          map((folders) => {
            const workspaceFolderUid = folders.find(
              (folder) =>
                folder.title.localeCompare(expectedWorkspaceFolderTitle, undefined, {
                  sensitivity: 'base',
                }) === 0,
            )?.uid;

            const defaultFolderUid = folders.find(
              (folder) =>
                folder.title.localeCompare(defaultFolderTitle, undefined, {
                  sensitivity: 'base',
                }) === 0,
            )?.uid;

            return [...new Set([workspaceFolderUid, defaultFolderUid].filter((uid): uid is string => Boolean(uid)))];
          }),
          switchMap((folderUids) => {
            if (folderUids.length === 0) {
              return of([]);
            }

            return forkJoin(folderUids.map((folderUid) => this.dashboardHttpService.queryDashboardsByFolderUid(folderUid))).pipe(
              map((dashboardArrays) => dashboardArrays.flat()),
            );
          }),
        );
      }),
      map((dashboards) => {
        const uniqueByUid = new Map(dashboards.map((dashboard) => [dashboard.uid, dashboard]));
        return [...uniqueByUid.values()].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
        );
      }),
    );
  }
}
