/**
 * Cloudflare R2 client for knowledge base sync.
 * Uses the S3-compatible API provided by R2.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3'
import { app } from 'electron'
import * as fs from 'fs/promises'
import path from 'path'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  /** Optional custom domain (e.g. https://your-domain.example.com). Overrides default R2 endpoint. */
  customDomain?: string
}

const CONFIG_FILE = 'r2-config.json'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

export async function getR2Config(): Promise<R2Config | null> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8')
    const cfg = JSON.parse(raw) as R2Config
    if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucketName) return null
    return cfg
  } catch {
    return null
  }
}

export async function saveR2Config(cfg: R2Config): Promise<void> {
  await fs.writeFile(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
}

export async function clearR2Config(): Promise<void> {
  try {
    await fs.unlink(getConfigPath())
  } catch {
    // ignore if not exists
  }
}

function buildEndpoint(cfg: R2Config): string {
  if (cfg.customDomain && cfg.customDomain.trim()) {
    const d = cfg.customDomain.trim()
    return d.startsWith('http') ? d : `https://${d}`
  }
  return `https://${cfg.accountId}.r2.cloudflarestorage.com`
}

export interface R2ObjectInfo {
  key: string
  size: number
  lastModified?: Date
}

export interface R2Client {
  putObject(key: string, body: Buffer): Promise<void>
  getObject(key: string): Promise<Buffer | null>
  deleteObjects(keys: string[]): Promise<void>
  listObjects(prefix?: string): Promise<R2ObjectInfo[]>
  testConnection(): Promise<{ success: boolean; error?: string }>
}

export function createR2Client(cfg: R2Config): R2Client {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: buildEndpoint(cfg),
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    }
  })

  return {
    async putObject(key: string, body: Buffer): Promise<void> {
      const cmd = new PutObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
        Body: body
      })
      await s3.send(cmd)
    },

    async getObject(key: string): Promise<Buffer | null> {
      try {
        const cmd = new GetObjectCommand({ Bucket: cfg.bucketName, Key: key })
        const res = await s3.send(cmd)
        if (!res.Body) return null
        const chunks: Uint8Array[] = []
        for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk)
        }
        return Buffer.concat(chunks)
      } catch (e: any) {
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null
        throw e
      }
    },

    async deleteObjects(keys: string[]): Promise<void> {
      if (keys.length === 0) return
      const cmd = new DeleteObjectsCommand({
        Bucket: cfg.bucketName,
        Delete: {
          Objects: keys.map((k) => ({ Key: k })),
          Quiet: true
        }
      })
      await s3.send(cmd)
    },

    async listObjects(prefix?: string): Promise<R2ObjectInfo[]> {
      const results: R2ObjectInfo[] = []
      let continuationToken: string | undefined
      do {
        const cmd = new ListObjectsV2Command({
          Bucket: cfg.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
        const res = await s3.send(cmd)
        for (const obj of res.Contents ?? []) {
          if (obj.Key) {
            results.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified })
          }
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (continuationToken)
      return results
    },

    async testConnection(): Promise<{ success: boolean; error?: string }> {
      try {
        const cmd = new HeadBucketCommand({ Bucket: cfg.bucketName })
        await s3.send(cmd)
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message ?? 'Connection failed' }
      }
    }
  }
}
