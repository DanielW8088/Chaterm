// Telemetry has been removed. These are no-op stubs to satisfy existing imports.

export const captureButtonClick = async (_eventName: string, _properties?: Record<string, any>): Promise<void> => {}

export const LoginFunnelEvents = {
  ENTER_LOGIN_PAGE: 'login_enter_page',
  CLICK_LOGIN_BUTTON: 'login_click_login',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  SKIP_LOGIN: 'login_skip',
  SEND_VERIFICATION_CODE: 'login_send_code'
} as const

export const LoginMethods = {
  ACCOUNT: 'username_password',
  EMAIL: 'email_verification',
  GUEST: 'guest_mode'
} as const

export const LoginFailureReasons = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  NETWORK_ERROR: 'network_error',
  SERVER_ERROR: 'server_error',
  VALIDATION_ERROR: 'validation_error',
  DATABASE_ERROR: 'database_error',
  UNKNOWN_ERROR: 'unknown_error'
} as const

export const ExtensionNames = {
  AUTO_COMPLETE: 'auto_complete',
  VIM_EDITOR: 'vim_editor',
  ALIAS: 'alias',
  HIGHLIGHT: 'highlight'
} as const

export const ExtensionStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled'
} as const

export const captureExtensionUsage = async (_extensionName: string, _status: string, _properties?: Record<string, any>): Promise<void> => {}
