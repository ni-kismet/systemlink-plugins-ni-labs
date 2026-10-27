import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';
import { HTTP_RETRY_CONFIG } from '../constants/http.constants';

/** Retries transient failures on safe query endpoints using exponential backoff. */
export function exponentialRetryInterceptor(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
): ReturnType<HttpInterceptorFn> {
  if (!shouldRetryRoute(req.url)) {
    return next(req);
  }

  return next(req).pipe(
    retry({
      count: HTTP_RETRY_CONFIG.maxRetries,
      delay: (error: unknown, retryCount: number) => {
        if (!isRetriableError(error)) {
          throw error;
        }

        const delayMs = HTTP_RETRY_CONFIG.baseDelayMs * 2 ** (retryCount - 1);

        return timer(delayMs);
      },
    }),
  );
}

function shouldRetryRoute(url: string): boolean {
  return HTTP_RETRY_CONFIG.retriableRoutes.some((route) => url.endsWith(route));
}

function isRetriableError(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    HTTP_RETRY_CONFIG.retriableStatusCodes.includes(error.status)
  );
}
