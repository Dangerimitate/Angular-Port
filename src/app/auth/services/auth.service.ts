import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';

export interface User {
  id: string | number;
  name: string;
  email?: string;
  number?: string;
  role: 'superadmin' | 'user';
  username?: string;
}

export interface OtpSendResponse {
  status: string;
  message: string;
  channel: 'email' | 'phone';
  recipient: string;
  expiresInSeconds: number;
  otp?: string;
  deliveryStatus?: {
    delivered?: boolean;
    previewUrl?: string;
    simulated?: boolean;
    message?: string;
  };
}

export interface AuthResponse {
  status: string;
  message: string;
  accessToken: string;
  refreshToken: string;
  token?: string;
  user: User;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = 'http://localhost:3000/api/auth';

  private readonly _currentUser = signal<User | null>(this.getStoredUser());
  private readonly _accessToken = signal<string | null>(this.getStoredAccessToken());
  private readonly _refreshToken = signal<string | null>(this.getStoredRefreshToken());

  readonly currentUser = this._currentUser.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly isSuperAdmin = computed(() => this._currentUser()?.role === 'superadmin');

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private getStoredAccessToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('skar_access_token') || localStorage.getItem('skar_token');
  }

  private getStoredRefreshToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('skar_refresh_token');
  }

  private getStoredUser(): User | null {
    if (!this.isBrowser()) return null;
    const raw = localStorage.getItem('skar_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  sendOtp(channel: 'email' | 'phone', recipient: string): Observable<OtpSendResponse> {
    return this.http.post<OtpSendResponse>(`${this.apiUrl}/send-otp`, {
      channel,
      recipient,
    });
  }

  verifyOtp(channel: 'email' | 'phone', recipient: string, otp: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/verify-otp`, {
        channel,
        recipient,
        otp,
      })
      .pipe(
        tap((res) => {
          const access = res.accessToken || res.token || '';
          this.setSession(access, res.refreshToken || '', res.user);
        })
      );
  }

  superadminLogin(identifier: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/superadmin/login`, {
        identifier,
        password,
      })
      .pipe(
        tap((res) => {
          const access = res.accessToken || res.token || '';
          this.setSession(access, res.refreshToken || '', res.user);
        })
      );
  }

  /**
   * Refresh expired access token using stored refresh token
   */
  refreshSession(): Observable<AuthResponse> {
    const currentRefreshToken = this._refreshToken();
    if (!currentRefreshToken) {
      this.logout();
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http
      .post<AuthResponse>(`${this.apiUrl}/refresh`, {
        refreshToken: currentRefreshToken,
      })
      .pipe(
        tap((res) => {
          const access = res.accessToken || res.token || '';
          this.setSession(access, res.refreshToken || '', res.user);
        }),
        catchError((err) => {
          this.logout();
          return throwError(() => err);
        })
      );
  }

  setSession(accessToken: string, refreshToken?: string, user?: User): void {
    this._accessToken.set(accessToken);
    if (refreshToken) {
      this._refreshToken.set(refreshToken);
    }
    if (user) {
      this._currentUser.set(user);
    }

    if (this.isBrowser()) {
      localStorage.setItem('skar_access_token', accessToken);
      localStorage.setItem('skar_token', accessToken); // Backward compatibility
      if (refreshToken) {
        localStorage.setItem('skar_refresh_token', refreshToken);
      }
      if (user) {
        localStorage.setItem('skar_user', JSON.stringify(user));
      }
    }
  }

  logout(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._currentUser.set(null);

    if (this.isBrowser()) {
      localStorage.removeItem('skar_access_token');
      localStorage.removeItem('skar_token');
      localStorage.removeItem('skar_refresh_token');
      localStorage.removeItem('skar_user');
    }

    // Replace current browser history entry so clicking back does not navigate to protected dashboard
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
