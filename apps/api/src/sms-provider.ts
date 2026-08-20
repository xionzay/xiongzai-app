export interface SmsDelivery {
  phone: string;
  code: string;
  expiresInSeconds: number;
  purpose: "LOGIN";
}

export interface SmsProvider {
  sendCode(delivery: SmsDelivery): Promise<void>;
}

/**
 * Local-only provider. It deliberately performs no logging and no network I/O.
 * The configured development code is handed to the provider by AuthService;
 * production must inject a paid/provider adapter instead.
 */
export class DevelopmentSmsProvider implements SmsProvider {
  async sendCode(delivery: SmsDelivery): Promise<void> { void delivery; }
}
