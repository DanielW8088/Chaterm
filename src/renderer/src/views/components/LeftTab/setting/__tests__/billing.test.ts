/**
 * Billing Component Unit Tests
 *
 * Tests for the Billing settings component including:
 * - Component rendering
 * - Usage ratio calculation and display
 * - Progress bar color calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import BillingComponent from '../billing.vue'

// Mock i18n
const mockTranslations: Record<string, string> = {
  'user.billing': 'Billing Usage',
  'user.email': 'Email',
  'user.subscription': 'Subscription Type',
  'user.budgetResetAt': 'Next Reset Time',
  'user.ratio': 'Usage Ratio',
  'user.subscriptionExpiresAt': 'Expiration',
  'user.subscriptionNeverExpires': 'Never'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

describe('Billing Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(BillingComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-progress': {
            template: '<div class="a-progress" :data-percent="percent" :data-stroke-color="strokeColor"><slot /></div>',
            props: ['percent', 'stroke-color', 'show-info', 'size', 'track-color']
          }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Reset all mocks
    vi.clearAllMocks()

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.section-header').exists()).toBe(true)
    })

    it('should display billing title', async () => {
      wrapper = createWrapper()
      await nextTick()

      const title = wrapper.find('h3')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('Billing Usage')
    })

    it('should render settings section card', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.settings-section').exists()).toBe(true)
    })
  })

  describe('Default State', () => {
    it('should display setting items', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(wrapper.find('.setting-item').exists()).toBe(true)
    })

    it('should display dash for empty email', async () => {
      wrapper = createWrapper()
      await nextTick()

      const emailLabel = wrapper.findAll('.info-label').find((el) => el.text() === 'Email')
      expect(emailLabel).toBeDefined()
      const emailRow = emailLabel?.element.parentElement
      const emailValue = emailRow?.querySelector('.info-value')
      expect(emailValue?.textContent).toBe('-')
    })

    it('should display dash for empty subscription', async () => {
      wrapper = createWrapper()
      await nextTick()

      const subscriptionValue = wrapper.find('.subscription-type')
      expect(subscriptionValue.text()).toBe('-')
    })

    it('should display 0% ratio when no data', async () => {
      wrapper = createWrapper()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-percent')).toBe('0')
      const ratioValue = wrapper.find('.ratio-value')
      expect(ratioValue.exists()).toBe(true)
      expect(ratioValue.text()).toBe('0%')
    })

    it('should use green color for 0% ratio', async () => {
      wrapper = createWrapper()
      await nextTick()

      const progress = wrapper.find('.a-progress')
      expect(progress.attributes('data-stroke-color')).toBe('#52c41a')
    })
  })

  describe('Component Cleanup', () => {
    it('should unmount without errors', async () => {
      wrapper = createWrapper()
      await nextTick()

      expect(() => {
        wrapper.unmount()
      }).not.toThrow()
    })

    it('should handle multiple mount/unmount cycles', async () => {
      wrapper = createWrapper()
      await nextTick()
      wrapper.unmount()

      wrapper = createWrapper()
      await nextTick()
      wrapper.unmount()

      expect(wrapper.exists()).toBe(false)
    })
  })
})
