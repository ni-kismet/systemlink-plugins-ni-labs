import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { IQueryResultValuesRequest, IQueryResultsRequest } from '../../models/test-result.models';
import { TestResultHttpService } from '../test-result-http/test-result-http.service';
import { escapeLinqString } from '../../library/systemlink-query-generators/core/linq';

/** Business logic for test result queries. */
@Injectable({
  providedIn: 'root',
})
export class TestResultService {
  private static readonly RESULT_VALUES_BATCH_SIZE = 500;
  private static readonly PROGRAM_LOOKBACK_DAYS = 90;

  /** Creates an instance of TestResultService. */
  public constructor(private readonly testResultHttpService: TestResultHttpService) {}

  /** Returns distinct program names observed in test results for a workspace. */
  public queryProgramNamesByWorkspace(workspaceId: string): Observable<string[]> {
    const safeWorkspaceId = escapeLinqString(workspaceId);
    const request: IQueryResultValuesRequest = {
      field: 'PROGRAM_NAME',
      take: TestResultService.RESULT_VALUES_BATCH_SIZE,
      filter: this.buildWorkspaceRecentStartedAtFilter(safeWorkspaceId),
    };

    return this.testResultHttpService.queryResultValues(request, workspaceId).pipe(
      map((values) =>
        [...new Set(values.map((value) => value?.trim()).filter((name): name is string => Boolean(name)))]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),
      ),
    );
  }

  /**
   * Queries the first matching result for a test program in a workspace and returns elapsed time.
   */
  public queryFirstElapsedTimeInSeconds(
    workspaceId: string,
    testProgram: string,
  ): Observable<number | undefined> {
    const safeWorkspaceId = escapeLinqString(workspaceId);
    const safeProgram = escapeLinqString(testProgram);
    const request: IQueryResultsRequest = {
      filter: `workspace == "${safeWorkspaceId}" && programName == "${safeProgram}"`,
      take: 1,
      orderBy: 'STARTED_AT',
      descending: true,
    };

    return this.testResultHttpService.queryResults(request, workspaceId).pipe(
      map((response) => {
        const duration = response.results[0]?.totalTimeInSeconds;
        if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
          return undefined;
        }

        return Math.round(duration);
      }),
    );
  }

  /** Builds a workspace-scoped startedAt filter for the configured recent lookback window. */
  private buildWorkspaceRecentStartedAtFilter(workspaceId: string): string {
    const sinceDate = new Date(
      Date.now() - TestResultService.PROGRAM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const sinceIso = sinceDate.toISOString();

    return `workspace == "${workspaceId}" && startedAt >= DateTime("${sinceIso}")`;
  }
}
