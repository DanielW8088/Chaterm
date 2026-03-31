/**
 * Chaterm Authentication Adapter
 * Authentication removed - adapter returns null tokens to gracefully disable sync.
 */

interface TokenData {
  token: string
  userId: string
  expiry?: number
}

interface AuthStatus {
  hasToken: boolean
  hasUserId: boolean
  isValid: boolean
  tokenType: 'guest' | 'user'
  expiry: number | null
}

class ChatermAuthAdapter {
  async getAuthToken(): Promise<string | null> {
    return null
  }

  async getCurrentUserId(): Promise<string | null> {
    return '999999999'
  }

  setAuthInfo(_token: string, _userId: string, _expiry?: number): void {
    // No-op: authentication removed
  }

  clearAuthInfo(): void {
    // No-op: authentication removed
  }

  getAuthStatus(): AuthStatus {
    return {
      hasToken: false,
      hasUserId: true,
      isValid: false,
      tokenType: 'guest',
      expiry: null
    }
  }
}

// Create singleton instance
const chatermAuthAdapter = new ChatermAuthAdapter()

export { ChatermAuthAdapter, chatermAuthAdapter }
export type { TokenData, AuthStatus }
