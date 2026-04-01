/**
 * JumpServer REST API client for fetching node (group) hierarchy.
 *
 * Authentication methods (in priority order):
 * 1. Access Key signing (HMAC-SHA256) — most secure, each request signed individually
 * 2. Username + password → temporary Bearer token
 *
 * If authentication fails, callers should gracefully fall back to flat asset listing.
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import crypto from 'crypto'
import https from 'https'

const logger = createLogger('jumpserver-api')

const JMS_ORG_HEADER = '00000000-0000-0000-0000-000000000002'
const REQUEST_TIMEOUT = 15000
const MAX_PAGES = 100

interface JmsNode {
  id: string
  name: string
  key: string
  value: string
}

interface JmsAssetSummary {
  id: string
  name: string
  address: string
}

// ---------------------------------------------------------------------------
// HTTP Signature auth (Access Key + Secret, HMAC-SHA256)
// Implements draft-cavage-http-signatures used by JumpServer.
// Signed headers: (request-target) accept date
// ---------------------------------------------------------------------------

function gmtDate(): string {
  return new Date().toUTCString()
}

function buildSigningString(method: string, path: string, accept: string, date: string): string {
  return `(request-target): ${method.toLowerCase()} ${path}\naccept: ${accept}\ndate: ${date}`
}

function signHmacSha256(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

function buildAuthorizationHeader(keyId: string, secret: string, method: string, path: string, accept: string, date: string): string {
  const signingString = buildSigningString(method, path, accept, date)
  const signature = signHmacSha256(secret, signingString)
  return `Signature keyId="${keyId}",algorithm="hmac-sha256",headers="(request-target) accept date",signature="${signature}"`
}

/**
 * Create an axios client that signs every request with Access Key + Secret.
 */
function createSignedApiClient(baseUrl: string, keyId: string, keySecret: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: REQUEST_TIMEOUT,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-JMS-ORG': JMS_ORG_HEADER
    }
  })

  // Interceptor: sign each outgoing request
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const date = gmtDate()
    // Build full path including query string from params
    let path = config.url || '/'
    if (config.params) {
      const qs = new URLSearchParams(config.params).toString()
      if (qs) path = `${path}?${qs}`
    }
    const method = (config.method || 'get').toLowerCase()
    const accept = 'application/json'

    logger.debug('Signing request', { method, path, date })
    config.headers.set('Date', date)
    config.headers.set('Accept', accept)
    config.headers.set('Authorization', buildAuthorizationHeader(keyId, keySecret, method, path, accept, date))
    return config
  })

  return client
}

// ---------------------------------------------------------------------------
// Password-based auth (Bearer token)
// ---------------------------------------------------------------------------

/**
 * Authenticate with JumpServer using username/password and return a Bearer token.
 * Tries HTTPS first, falls back to HTTP.
 */
export async function authenticateWithPassword(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ token: string; baseUrl: string } | null> {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false })
  const candidates = buildBaseUrlCandidates(host, port)

  for (const baseUrl of candidates) {
    try {
      const resp = await axios.post(
        `${baseUrl}/api/v1/authentication/auth/`,
        { username, password },
        {
          timeout: REQUEST_TIMEOUT,
          httpsAgent,
          headers: {
            'Content-Type': 'application/json',
            'X-JMS-ORG': JMS_ORG_HEADER
          }
        }
      )
      const token = resp.data?.token
      if (token) {
        logger.info('JumpServer API password authentication successful', { baseUrl })
        return { token, baseUrl }
      }
    } catch (e: any) {
      logger.debug('JumpServer API password auth attempt failed', {
        baseUrl,
        status: e?.response?.status,
        error: e?.message
      })
    }
  }

  logger.info('JumpServer API password authentication failed for all candidates')
  return null
}

function createBearerApiClient(baseUrl: string, token: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: REQUEST_TIMEOUT,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-JMS-ORG': JMS_ORG_HEADER
    }
  })
}

// ---------------------------------------------------------------------------
// URL resolution helper
// ---------------------------------------------------------------------------

function buildBaseUrlCandidates(host: string, port: number): string[] {
  const candidates: string[] = []
  const isSSHPort = port === 22 || port === 2222

  if (isSSHPort) {
    // SSH port — try common JumpServer web ports
    candidates.push(`https://${host}`, `http://${host}`, `https://${host}:8443`, `http://${host}:8080`, `http://${host}:80`, `https://${host}:443`)
  } else if (port === 443) {
    candidates.push(`https://${host}`)
  } else if (port === 80) {
    candidates.push(`http://${host}`)
  } else {
    candidates.push(`https://${host}:${port}`, `http://${host}:${port}`, `https://${host}`, `http://${host}`)
  }
  return candidates
}

/**
 * Resolve the JumpServer web base URL by probing candidates with a signed request.
 * Uses the Access Key to authenticate the probe so we get a definitive answer.
 */
async function resolveBaseUrlWithSignedProbe(host: string, port: number, keyId: string, keySecret: string): Promise<string | null> {
  const candidates = buildBaseUrlCandidates(host, port)

  for (const baseUrl of candidates) {
    try {
      const date = gmtDate()
      const probePath = '/api/v1/users/profile/'
      const accept = 'application/json'
      const authorization = buildAuthorizationHeader(keyId, keySecret, 'get', probePath, accept, date)

      await axios.get(`${baseUrl}${probePath}`, {
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: {
          Accept: accept,
          Date: date,
          Authorization: authorization,
          'X-JMS-ORG': JMS_ORG_HEADER
        }
      })
      logger.info('Resolved JumpServer web URL via signed probe', { baseUrl })
      return baseUrl
    } catch (e: any) {
      const status = e?.response?.status
      // Any HTTP response (even 4xx) means the server is reachable
      if (status) {
        logger.info('Resolved JumpServer web URL (HTTP response received)', { baseUrl, status })
        return baseUrl
      }
      logger.debug('JumpServer web URL signed probe failed', { baseUrl, error: e?.message })
    }
  }
  logger.warn('Could not resolve JumpServer web URL, tried candidates', { candidates })
  return null
}

// ---------------------------------------------------------------------------
// Node & asset fetching (shared across auth methods)
// ---------------------------------------------------------------------------

async function fetchUserNodes(client: AxiosInstance): Promise<JmsNode[]> {
  const allNodes: JmsNode[] = []
  let url: string | null = '/api/v1/perms/users/self/nodes/'
  let page = 0

  while (url && page < MAX_PAGES) {
    page++
    try {
      const resp = await client.get(url, { params: { limit: 100, offset: (page - 1) * 100 } })
      const data = resp.data
      const results: any[] = Array.isArray(data) ? data : (data?.results ?? [])

      for (const item of results) {
        if (item.id && item.name) {
          allNodes.push({ id: item.id, name: item.name, key: item.key || '', value: item.value || item.name })
        }
      }

      if (!Array.isArray(data) && data?.next) {
        try {
          const nextUrl = new URL(data.next)
          url = nextUrl.pathname + nextUrl.search
        } catch {
          url = null
        }
      } else {
        url = null
      }
    } catch (e: any) {
      logger.warn('Failed to fetch JumpServer nodes page', { page, error: e?.message })
      break
    }
  }

  logger.info('Fetched JumpServer nodes', { count: allNodes.length })
  return allNodes
}

async function fetchNodeAssets(client: AxiosInstance, nodeId: string): Promise<JmsAssetSummary[]> {
  const assets: JmsAssetSummary[] = []
  let url: string | null = `/api/v1/perms/users/self/nodes/${nodeId}/assets/`
  let page = 0

  while (url && page < MAX_PAGES) {
    page++
    try {
      const resp = await client.get(url, { params: { limit: 100, offset: (page - 1) * 100 } })
      const data = resp.data
      const results: any[] = Array.isArray(data) ? data : (data?.results ?? [])

      for (const item of results) {
        const address = item.address || item.ip
        if (address) {
          assets.push({ id: item.id || '', name: item.name || item.hostname || '', address })
        }
      }

      if (!Array.isArray(data) && data?.next) {
        try {
          const nextUrl = new URL(data.next)
          url = nextUrl.pathname + nextUrl.search
        } catch {
          url = null
        }
      } else {
        url = null
      }
    } catch (e: any) {
      logger.warn('Failed to fetch assets for node', { nodeId, page, error: e?.message })
      break
    }
  }

  return assets
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a mapping from asset address (IP) to node names.
 * An asset can belong to multiple nodes, so the value is an array.
 *
 * Authentication priority:
 * 1. Access Key signing (accessKeyId + accessKeySecret)
 * 2. Username + password → Bearer token
 *
 * Returns null if the API is unreachable or authentication fails.
 */
export async function buildNodeAssetMap(
  host: string,
  port: number,
  username: string,
  password: string,
  accessKeyId?: string,
  accessKeySecret?: string
): Promise<Map<string, string[]> | null> {
  let client: AxiosInstance

  if (accessKeyId && accessKeySecret) {
    // Access Key + Secret signing (most secure)
    logger.info('Using JumpServer Access Key signing for API authentication')
    const baseUrl = await resolveBaseUrlWithSignedProbe(host, port, accessKeyId, accessKeySecret)
    if (!baseUrl) {
      logger.info('Could not resolve JumpServer web URL for Access Key auth')
      return null
    }
    client = createSignedApiClient(baseUrl, accessKeyId, accessKeySecret)
  } else if (password) {
    // Username + password → Bearer token
    const auth = await authenticateWithPassword(host, port, username, password)
    if (!auth) return null
    client = createBearerApiClient(auth.baseUrl, auth.token)
  } else {
    return null
  }

  const nodes = await fetchUserNodes(client)
  if (nodes.length === 0) {
    logger.info('No nodes found from JumpServer API')
    return null
  }

  const assetNodeMap = new Map<string, string[]>()

  for (const node of nodes) {
    const assets = await fetchNodeAssets(client, node.id)
    for (const asset of assets) {
      const existing = assetNodeMap.get(asset.address)
      if (existing) {
        if (!existing.includes(node.name)) {
          existing.push(node.name)
        }
      } else {
        assetNodeMap.set(asset.address, [node.name])
      }
    }
  }

  logger.info('Built JumpServer node-asset mapping', {
    nodeCount: nodes.length,
    assetCount: assetNodeMap.size
  })

  return assetNodeMap
}
