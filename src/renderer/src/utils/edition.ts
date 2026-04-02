/**
 * Edition utilities for renderer process
 * Uses configuration injected at build time from build/edition-config/global.json
 * This ensures single source of truth for all edition-specific URLs
 */

// Edition configuration interface (matches build/edition-config/global.json structure)
export interface EditionConfig {
  edition: string
  displayName: string
  api: {
    baseUrl: string
    kmsUrl: string
    syncUrl: string
  }
  update: {
    serverUrl: string
    releaseNotesUrl: string
  }
  auth: {
    loginBaseUrl: string
  }
  defaults: {
    language: string
  }
  legal: {
    privacyPolicyUrl: string
    termsOfServiceUrl: string
  }
  speech: {
    wsUrl: string
  }
  docs: {
    baseUrl: string
  }
}

// Declare the global variable injected by Vite at build time
declare const __EDITION_CONFIG__: EditionConfig

/**
 * Get the full edition configuration object
 * Injected at build time from build/edition-config/global.json
 */
export const getEditionConfig = (): EditionConfig => __EDITION_CONFIG__

/**
 * Get default language based on edition config
 */
export const getDefaultLanguage = (): string => import.meta.env.RENDERER_DEFAULT_LANGUAGE || __EDITION_CONFIG__.defaults.language

/**
 * Get API base URL
 */
export const getApiBaseUrl = (): string => import.meta.env.RENDERER_VUE_APP_API_BASEURL || __EDITION_CONFIG__.api.baseUrl

/**
 * Get KMS server URL
 */
export const getKmsServerUrl = (): string => import.meta.env.RENDERER_KMS_SERVER_URL || __EDITION_CONFIG__.api.kmsUrl

/**
 * Get sync server URL
 */
export const getSyncServerUrl = (): string => import.meta.env.RENDERER_SYNC_SERVER_URL || __EDITION_CONFIG__.api.syncUrl

/**
 * Get speech WebSocket URL
 */
export const getSpeechWsUrl = (): string => import.meta.env.RENDERER_SPEECH_WS_URL || __EDITION_CONFIG__.speech.wsUrl

/**
 * Get docs base URL
 */
export const getDocsBaseUrl = (): string => import.meta.env.RENDERER_DOCS_BASE_URL || __EDITION_CONFIG__.docs.baseUrl

/**
 * Get SSO/login base URL
 */
export const getSsoBaseUrl = (): string => import.meta.env.RENDERER_SSO || __EDITION_CONFIG__.auth.loginBaseUrl

/**
 * Get privacy policy URL
 */
export const getPrivacyPolicyUrl = (): string => __EDITION_CONFIG__.legal.privacyPolicyUrl

/**
 * Get terms of service URL
 */
export const getTermsOfServiceUrl = (): string => __EDITION_CONFIG__.legal.termsOfServiceUrl

/**
 * Get documentation URL
 */
export const getDocumentationUrl = (): string => {
  const baseUrl = getDocsBaseUrl()
  return `${baseUrl}/`
}
