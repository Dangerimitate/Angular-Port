import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.currentUser;
  readonly isSuperAdmin = this.authService.isSuperAdmin;

  ngOnInit(): void {
    // Defense-in-depth: If unauthenticated, immediately replace history and redirect
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login'], { replaceUrl: true });
    }
  }

  logout(): void {
    this.authService.logout();
  }
}
