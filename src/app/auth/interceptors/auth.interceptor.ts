import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  // Attach access token to authorization header if available
  let authReq = req;
  if (token && !req.headers.has('Authorization')) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // If 401 Unauthorized occurs on protected endpoints, attempt refresh token rotation
      const isAuthEndpoint = req.url.includes('/login') || req.url.includes('/send-otp') || req.url.includes('/verify-otp') || req.url.includes('/refresh');

      if (error.status === 401 && !isAuthEndpoint && authService.refreshToken()) {
        return authService.refreshSession().pipe(
          switchMap((refreshRes) => {
            const newReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${refreshRes.accessToken}`,
              },
            });
            return next(newReq);
          }),
          catchError((refreshErr) => {
            authService.logout();
            return throwError(() => refreshErr);
          })
        );
      }

      return throwError(() => error);
    })
  );
};
