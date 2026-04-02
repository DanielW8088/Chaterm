import type { EmbeddingProvider, EmbeddingConfig } from './types'
import { OpenAIEmbeddingProvider } from './embedding-openai'

export { type EmbeddingProvider }

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  return new OpenAIEmbeddingProvider(config.apiKey, config.baseUrl)
}
