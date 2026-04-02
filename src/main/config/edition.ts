/**
 * Edition configuration module for main process
 * Loads and manages edition-specific configuration from build/edition-config/global.json
 *
 * IMPORTANT: All edition-specific URLs are defined in build/edition-config/global.json
 * This is the single source of truth - do NOT hardcode URLs elsewhere
 */
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
const logger = createLogger('config')

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

let cachedConfig: EditionConfig | null = null
let userDataPath: string | null = null
let userDataPathInitialized = false

/**
 * Initialize the userData path.
 * This function MUST be called at the very beginning of the app startup,
 * before any other module tries to access userData.
 */
export function initUserDataPath(): void {
  if (userDataPathInitialized) {
    return
  }

  try {
    const basePath = app.getPath('appData')
    const customPath = path.join(basePath, 'chaterm')
    app.setPath('userData', customPath)
    userDataPath = customPath
  } catch (error) {
    // Fallback for test environment or non-Electron environment
    userDataPath = path.join(process.cwd(), 'test_data')
  }

  userDataPathInitialized = true
}

/**
 * Get the userData path.
 * If not initialized, it will initialize automatically (for backward compatibility).
 */
export function getUserDataPath(): string {
  if (!userDataPathInitialized) {
    initUserDataPath()
  }
  return userDataPath as string
}

/**
 * Get protocol prefix for deep linking
 */
export function getProtocolPrefix(): string {
  return 'chaterm://'
}

/**
 * Get protocol name (without ://)
 */
export function getProtocolName(): string {
  return 'chaterm'
}

/**
 * Load edition configuration from JSON file
 * This is the single source of truth for all edition-specific URLs
 */
export function loadEditionConfig(): EditionConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  // Try to load from packaged resources first, then from dev path
  const packagedConfigPath = path.join(process.resourcesPath || '', 'edition-config/global.json')
  const devConfigPath = path.join(process.cwd(), 'build/edition-config/global.json')

  let configPath: string | null = null

  if (fs.existsSync(packagedConfigPath)) {
    configPath = packagedConfigPath
  } else if (fs.existsSync(devConfigPath)) {
    configPath = devConfigPath
  }

  if (!configPath) {
    throw new Error(`[Edition] Config file not found. Checked paths: ${packagedConfigPath}, ${devConfigPath}`)
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8')
    cachedConfig = JSON.parse(configContent) as EditionConfig
    logger.info('Loaded edition configuration', { configPath })
    return cachedConfig
  } catch (error) {
    throw new Error(`[Edition] Failed to parse config file: ${configPath}, error: ${error}`)
  }
}

/**
 * Clear cached config (useful for testing or hot reload)
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

/**
 * Get the full edition configuration object
 */
export function getEditionConfig(): EditionConfig {
  return loadEditionConfig()
}

/**
 * Get API base URL
 */
export function getApiBaseUrl(): string {
  return loadEditionConfig().api.baseUrl
}

/**
 * Get KMS URL
 */
export function getKmsUrl(): string {
  return loadEditionConfig().api.kmsUrl
}

/**
 * Get sync URL
 */
export function getSyncUrl(): string {
  return loadEditionConfig().api.syncUrl
}

/**
 * Get update server URL
 */
export function getUpdateServerUrl(): string {
  return loadEditionConfig().update.serverUrl
}

/**
 * Get login base URL
 */
export function getLoginBaseUrl(): string {
  return loadEditionConfig().auth.loginBaseUrl
}

/**
 * Get default language
 */
export function getDefaultLanguage(): string {
  return loadEditionConfig().defaults.language
}

/**
 * Get privacy policy URL
 */
export function getPrivacyPolicyUrl(): string {
  return loadEditionConfig().legal.privacyPolicyUrl
}

/**
 * Get terms of service URL
 */
export function getTermsOfServiceUrl(): string {
  return loadEditionConfig().legal.termsOfServiceUrl
}

/**
 * Get docs base URL
 */
export function getDocsBaseUrl(): string {
  return loadEditionConfig().docs.baseUrl
}

/**
 * Get speech WebSocket URL
 */
export function getSpeechWsUrl(): string {
  return loadEditionConfig().speech.wsUrl
}
