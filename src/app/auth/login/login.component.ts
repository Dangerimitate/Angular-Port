import {
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, OtpSendResponse } from '../services/auth.service';

type LoginMode = 'user' | 'superadmin';
type OtpChannel = 'email' | 'phone';
type UserStep = 'input' | 'otp';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  // Tab & Flow State
  activeMode = signal<LoginMode>('user');
  userStep = signal<UserStep>('input');
  selectedChannel = signal<OtpChannel>('email');

  // Input states
  emailOrPhone = signal('');
  superadminIdentifier = signal('superadmin@skar.com');
  superadminPassword = signal('SuperAdmin@123');
  showPassword = signal(false);

  // OTP State: 6 digits array
  otpDigits = signal<string[]>(['', '', '', '', '', '']);
  latestOtpInfo = signal<OtpSendResponse | null>(null);

  // Status & Feedback
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Resend Countdown Timer
  resendCountdown = signal(0);
  private timerInterval: any = null;

  ngOnDestroy(): void {
    this.clearResendTimer();
  }

  // Switch tabs (User OTP vs SuperAdmin)
  switchMode(mode: LoginMode): void {
    this.activeMode.set(mode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  // Switch OTP channel (Email vs Phone)
  selectChannel(channel: OtpChannel): void {
    if (this.selectedChannel() !== channel) {
      this.selectedChannel.set(channel);
      this.emailOrPhone.set('');
      this.errorMessage.set(null);
      this.successMessage.set(null);
    }
  }

  // Quick fill demo user inputs
  fillDemoUser(type: 'email' | 'phone'): void {
    if (type === 'email') {
      this.selectChannel('email');
      this.emailOrPhone.set('rahul@example.com');
    } else {
      this.selectChannel('phone');
      this.emailOrPhone.set('9876543210');
    }
  }

  // Fill demo superadmin credentials
  fillDemoSuperadmin(): void {
    this.superadminIdentifier.set('superadmin@skar.com');
    this.superadminPassword.set('SuperAdmin@123');
  }

  // Trigger Send 6-Digit OTP
  submitSendOtp(): void {
    const rawVal = this.emailOrPhone().trim();
    if (!rawVal) {
      this.errorMessage.set(
        this.selectedChannel() === 'email'
          ? 'Please enter your email address'
          : 'Please enter your phone number'
      );
      return;
    }

    if (this.selectedChannel() === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawVal)) {
        this.errorMessage.set('Please enter a valid email address (e.g. name@domain.com)');
        return;
      }
    } else {
      const cleanPhone = rawVal.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        this.errorMessage.set('Please enter a valid 10-digit phone number');
        return;
      }
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.sendOtp(this.selectedChannel(), rawVal).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.latestOtpInfo.set(res);
        this.userStep.set('otp');
        this.otpDigits.set(['', '', '', '', '', '']);
        this.successMessage.set(res.message);
        this.startResendTimer(60);

        // Auto-focus first OTP input after transition
        setTimeout(() => {
          this.focusOtpBox(0);
        }, 100);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.error?.message || 'Failed to send OTP. Please check backend connection.';
        this.errorMessage.set(msg);
      },
    });
  }

  // Handle single digit input
  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Handle backspace or empty
    if (!value) {
      const updated = [...this.otpDigits()];
      updated[index] = '';
      this.otpDigits.set(updated);
      return;
    }

    // Keep only the last character entered if it is numeric
    const lastChar = value.slice(-1);
    if (!/^\d$/.test(lastChar)) {
      input.value = this.otpDigits()[index];
      return;
    }

    const updated = [...this.otpDigits()];
    updated[index] = lastChar;
    this.otpDigits.set(updated);
    input.value = lastChar;

    // Move to next digit
    if (index < 5) {
      this.focusOtpBox(index + 1);
    } else {
      // If last box filled, check if all 6 filled and trigger auto-verify
      if (this.isOtpComplete()) {
        this.submitVerifyOtp();
      }
    }
  }

  // Handle key down (Backspace navigation & arrow navigation)
  onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace') {
      if (!this.otpDigits()[index] && index > 0) {
        event.preventDefault();
        const updated = [...this.otpDigits()];
        updated[index - 1] = '';
        this.otpDigits.set(updated);
        this.focusOtpBox(index - 1);
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusOtpBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      this.focusOtpBox(index + 1);
    }
  }

  // Support pasting full 6-digit code
  onPasteOtp(event: ClipboardEvent): void {
    event.preventDefault();
    const clipData = event.clipboardData?.getData('text') || '';
    const digitsOnly = clipData.replace(/\D/g, '').slice(0, 6);

    if (digitsOnly.length > 0) {
      const current = [...this.otpDigits()];
      for (let i = 0; i < 6; i++) {
        current[i] = digitsOnly[i] || '';
      }
      this.otpDigits.set(current);

      const focusIdx = Math.min(digitsOnly.length, 5);
      this.focusOtpBox(focusIdx);

      if (digitsOnly.length === 6) {
        this.submitVerifyOtp();
      }
    }
  }

  // Autofill OTP helper from demo
  quickFillOtp(code?: string): void {
    const targetCode = code || this.latestOtpInfo()?.otp;
    if (targetCode && targetCode.length === 6) {
      this.otpDigits.set(targetCode.split(''));
      this.submitVerifyOtp();
    }
  }

  isOtpComplete(): boolean {
    return this.otpDigits().every((d) => /^\d$/.test(d));
  }

  get fullOtpString(): string {
    return this.otpDigits().join('');
  }

  // Verify 6-digit OTP
  submitVerifyOtp(): void {
    const otp = this.fullOtpString;
    if (otp.length !== 6) {
      this.errorMessage.set('Please enter all 6 digits of the verification code');
      return;
    }

    const rawVal = this.emailOrPhone().trim();
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.verifyOtp(this.selectedChannel(), rawVal, otp).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.successMessage.set(`Welcome back, ${res.user.name}! Redirecting...`);
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 800);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.error?.message || 'Invalid or expired OTP code.';
        this.errorMessage.set(msg);
      },
    });
  }

  // Return back to change email/phone
  changeRecipient(): void {
    this.userStep.set('input');
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.otpDigits.set(['', '', '', '', '', '']);
    this.clearResendTimer();
  }

  // Resend OTP
  resendOtp(): void {
    if (this.resendCountdown() > 0) return;
    this.submitSendOtp();
  }

  private startResendTimer(seconds: number): void {
    this.clearResendTimer();
    this.resendCountdown.set(seconds);
    this.timerInterval = setInterval(() => {
      const current = this.resendCountdown();
      if (current <= 1) {
        this.clearResendTimer();
      } else {
        this.resendCountdown.set(current - 1);
      }
    }, 1000);
  }

  private clearResendTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.resendCountdown.set(0);
  }

  private focusOtpBox(index: number): void {
    const inputs = this.otpInputs?.toArray();
    if (inputs && inputs[index]) {
      inputs[index].nativeElement.focus();
      inputs[index].nativeElement.select();
    }
  }

  // SuperAdmin Login
  submitSuperadminLogin(): void {
    const id = this.superadminIdentifier().trim();
    const pass = this.superadminPassword().trim();

    if (!id || !pass) {
      this.errorMessage.set('SuperAdmin identifier and password are both required');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.superadminLogin(id, pass).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.successMessage.set(`SuperAdmin Access Granted: ${res.user.name}. Redirecting...`);
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 800);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.error?.message || 'SuperAdmin authentication failed.';
        this.errorMessage.set(msg);
      },
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((prev) => !prev);
  }
}
