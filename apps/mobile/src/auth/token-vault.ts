export class TokenVault {
  #accessToken: string | null = null;
  #sessionId: string | null = null;

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  getSessionId(): string | null { return this.#sessionId; }

  setAccessToken(token: string, sessionId?: string): void {
    this.#accessToken = token;
    if (sessionId !== undefined) this.#sessionId = sessionId;
  }

  clear(): void {
    this.#accessToken = null;
    this.#sessionId = null;
  }
}
