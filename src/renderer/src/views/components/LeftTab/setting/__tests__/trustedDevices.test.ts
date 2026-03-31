/**
 * Trusted Devices Component Unit Tests
 *
 * Tests for the Trusted Devices settings component including:
 * - Component rendering and title
 * - Login required state display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import TrustedDevices from '../trustedDevices.vue'

const mockTranslations: Record<string, string> = {
  'user.trustedDevices': 'Trusted Devices',
  'user.trustedDevicesDescription': 'These devices have been verified.',
  'user.trustedDevicesLoginRequired': 'Please sign in to manage trusted devices.',
  'user.trustedDevicesCount': '{current} / {max} devices',
  'user.trustedDevicesMaxReached': 'Max trusted devices reached.',
  'user.trustedDevicesRemoveConfirm': 'Continue?',
  'user.trustedDevicesCurrentDevice': 'Current device',
  'user.trustedDevicesNoData': 'No trusted devices yet.',
  'user.trustedDevicesRemove': 'Remove',
  'user.trustedDevicesUnknownDevice': 'Unknown device',
  'user.trustedDevicesLoadFailed': 'Failed to load trusted devices',
  'user.trustedDevicesRevokeFailed': 'Failed to revoke device',
  'common.done': 'Done',
  'common.cancel': 'Cancel',
  'common.saved': 'Saved'
}

const mockT = (key: string, params?: Record<string, string | number>) => {
  const s = mockTranslations[key] ?? key
  if (params && typeof s === 'string') {
    return Object.entries(params).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), s)
  }
  return s
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: mockT })
}))

vi.mock('@/utils/permission', () => ({
  getUserInfo: vi.fn(() => ({ uid: 'test-uid' }))
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

describe('TrustedDevices Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (props: { isActive?: boolean } = {}) => {
    return mount(TrustedDevices, {
      props: { isActive: props.isActive ?? true },
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': { template: '<div class="a-card"><slot /></div>' },
          'a-form': { template: '<form class="a-form"><slot /></form>' },
          'a-form-item': { template: '<div class="a-form-item"><slot name="label" /><slot /></div>' },
          'a-spin': { template: '<div class="a-spin"><slot /></div>' },
          'a-tag': { template: '<span class="a-tag"><slot /></span>', props: ['color'] },
          'a-button': {
            template: '<button class="a-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'danger', 'size', 'disabled']
          },
          'a-modal': {
            template: '<div v-if="open" class="a-modal"><slot /><button class="modal-ok" @click="$emit(\'ok\')">OK</button></div>',
            props: ['open'],
            emits: ['ok', 'update:open']
          }
        },
        mocks: { $t: mockT }
      }
    })
  }

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.userInfo').exists()).toBe(true)
    })

    it('should display trusted devices title', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const label = wrapper.find('.label-text')
      expect(label.exists()).toBe(true)
      expect(label.text()).toBe('Trusted Devices')
    })
  })

  describe('Login Required State', () => {
    it('should show login required message', async () => {
      wrapper = createWrapper()
      await nextTick()
      const desc = wrapper.find('.description')
      expect(desc.exists()).toBe(true)
      expect(desc.text()).toBe('Please sign in to manage trusted devices.')
    })
  })
})
