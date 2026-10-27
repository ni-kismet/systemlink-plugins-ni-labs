import { HttpInterceptorFn } from '@angular/common/http';
import { DEFAULT_HTTP_HEADERS } from '../constants/http.constants';

/**
 * Applies default Content-Type and Accept headers to every outgoing HTTP request.
 */
export function defaultHeadersInterceptor(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
): ReturnType<HttpInterceptorFn> {
  if (req.body instanceof FormData) {
    return next(req.clone({
      setHeaders: {
        accept: DEFAULT_HTTP_HEADERS.accept,
      },
    }));
  }

  const cloned = req.clone({
    setHeaders: DEFAULT_HTTP_HEADERS,
  });

  return next(cloned);
}
