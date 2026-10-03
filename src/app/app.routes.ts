import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./auth/login/login.component').then((m) => m.LoginComponent),
    title: 'Login | SkarProvince Identity',
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    title: 'Dashboard | SkarProvince Identity',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
