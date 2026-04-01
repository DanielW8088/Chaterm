/**
 * KB capacity helpers. With Cloudflare R2, there are no built-in quota limits.
 * These stubs are kept for API compatibility with existing call sites.
 */

export type SubscriptionTier = 'free' | 'lite' | 'pro' | 'ultra' | 'unknown'

export interface KbCapacityDisplay {
  tier: SubscriptionTier
  totalBytes: number
}

export function resolveKbCapacityDisplay(_subscription?: string): KbCapacityDisplay {
  // No quota limits with R2 - return unlimited (represented as -1).
  return { tier: 'unknown', totalBytes: -1 }
}
