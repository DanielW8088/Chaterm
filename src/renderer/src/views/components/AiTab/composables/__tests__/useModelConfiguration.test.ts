import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useModelConfiguration } from '../useModelConfiguration'
import * as stateModule from '@renderer/agent/storage/state'
import { ref } from 'vue'

// Create a shared mock ref that can be updated in tests
const mockChatAiModelValue = ref('')

// Mock dependencies
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn(),
  storeSecret: vi.fn(),
  getSecret: vi.fn()
}))

vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    chatAiModelValue: mockChatAiModelValue
  })
}))

describe('useModelConfiguration', () => {
  const mockModelOptions = [
    { id: '1', name: 'claude-4-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
    { id: '2', name: 'gpt-5', checked: true, type: 'chat', apiProvider: 'openai' },
    { id: '3', name: 'claude-4-opus', checked: false, type: 'chat', apiProvider: 'anthropic' },
    { id: '4', name: 'deepseek-chat', checked: true, type: 'chat', apiProvider: 'deepseek' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockChatAiModelValue.value = ''
  })

  describe('initModel', () => {
    it('should initialize model options from global state', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      expect(AgentAiModelsOptions.value).toHaveLength(3) // Only checked models
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-4-5-sonnet')
      expect(AgentAiModelsOptions.value[1].label).toBe('deepseek-chat')
      expect(AgentAiModelsOptions.value[2].label).toBe('gpt-5')
    })

    it('should filter out unchecked models', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      const hasUncheckedModel = AgentAiModelsOptions.value.some((option) => option.label === 'claude-4-opus')
      expect(hasUncheckedModel).toBe(false)
    })

    it('should use provider-specific model when current model is not set', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'anthropicModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('anthropicModelId')
    })

    it('should use provider-specific model key based on apiProvider', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'openai'
        if (key === 'openAiModelId') return 'gpt-5'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('openAiModelId')
    })

    it('should handle bedrock provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'bedrock'
        if (key === 'apiModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('apiModelId')
    })

    it('should sort thinking models first', async () => {
      const modelsWithThinking = [
        { id: '1', name: 'claude-4-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
        { id: '2', name: 'gpt-5-Thinking', checked: true, type: 'chat', apiProvider: 'openai' },
        { id: '3', name: 'claude-4-opus-Thinking', checked: true, type: 'chat', apiProvider: 'anthropic' }
      ]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return modelsWithThinking
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      // Thinking models should come first
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-4-opus-Thinking')
      expect(AgentAiModelsOptions.value[1].label).toBe('gpt-5-Thinking')
      expect(AgentAiModelsOptions.value[2].label).toBe('claude-4-5-sonnet')
    })

    it('should prefer current tab model when it is still available', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('gpt-5')
      expect(stateModule.getGlobalState).not.toHaveBeenCalledWith('apiProvider')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'openai')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('openAiModelId', 'gpt-5')
    })

    it('should fallback to first available model when stored default model is not available', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'default'
        if (key === 'defaultModelId') return 'invalid-model'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('claude-4-5-sonnet')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'anthropic')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('anthropicModelId', 'claude-4-5-sonnet')
    })

    it('should not change model when there are no available models', async () => {
      const noAvailableModels = [{ id: '1', name: 'claude-4-5-sonnet', checked: false, type: 'chat', apiProvider: 'anthropic' }]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return noAvailableModels
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('')
      expect(stateModule.updateGlobalState).not.toHaveBeenCalled()
    })
  })

  describe('initModelOptions', () => {
    it('should skip initialization when model options already exist', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      const { initModelOptions } = useModelConfiguration()
      await initModelOptions()

      // Should return early since modelOptions already exists
      expect(stateModule.getGlobalState).toHaveBeenCalledWith('modelOptions')
    })

    it('should initialize with empty model options when none exist', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      const { initModelOptions } = useModelConfiguration()
      await initModelOptions()

      // Should initialize with empty model options
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', [])
    })
  })

  describe('handleChatAiModelChange', () => {
    it('should update apiProvider when model changes', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'openai')
    })

    it('should update correct provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('openAiModelId', 'gpt-5')
    })

    it('should handle deepseek provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'deepseek-chat'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiModelId', 'deepseek-chat')
    })
  })

  describe('checkModelConfig', () => {
    it('should validate model configuration', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'anthropicModelId') return 'claude-4-5-sonnet'
        if (key === 'modelOptions') return [{ id: '1', name: 'test', checked: true, type: 'standard', apiProvider: 'default' }]
        return null
      })

      vi.mocked(stateModule.getSecret).mockImplementation(async (key) => {
        if (key === 'anthropicApiKey') return 'test-key'
        return undefined
      })

      const { checkModelConfig } = useModelConfiguration()
      const result = await checkModelConfig()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })

    it('should show notification when model config is invalid', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      const { checkModelConfig } = useModelConfiguration()
      const result = await checkModelConfig()

      // Verify that the function handles invalid config gracefully
      expect(result).toBeDefined()
      expect(result.success).toBe(false)
    })
  })

  describe('refreshModelOptions', () => {
    it('should re-initialize model options from saved state', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { refreshModelOptions, AgentAiModelsOptions } = useModelConfiguration()
      await refreshModelOptions()

      // refreshModelOptions calls initModel which loads from saved state
      expect(AgentAiModelsOptions.value.length).toBeGreaterThan(0)
    })
  })

  describe('hasAvailableModels', () => {
    it('hasAvailableModels is false when no checked models exist', async () => {
      const noAvailableModels = [{ id: '1', name: 'claude-4-5-sonnet', checked: false, type: 'chat', apiProvider: 'anthropic' }]
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return noAvailableModels
        return null
      })

      const { initModel, hasAvailableModels, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      expect(AgentAiModelsOptions.value).toHaveLength(0)
      expect(hasAvailableModels.value).toBe(false)
    })
  })
})
