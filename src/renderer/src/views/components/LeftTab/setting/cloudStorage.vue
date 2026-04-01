<template>
  <div class="cloud-storage-settings">
    <a-card
      :bordered="false"
      class="cloud-storage-container"
    >
      <a-form
        :colon="false"
        label-align="left"
        :label-col="{ span: 7 }"
        :wrapper-col="{ span: 17 }"
        class="custom-form"
      >
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('cloudStorage.title') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
          class="description-item"
        >
          <div class="description">{{ $t('cloudStorage.description') }}</div>
        </a-form-item>

        <a-form-item :label="$t('cloudStorage.accountId')">
          <a-input
            v-model:value="form.accountId"
            :placeholder="$t('cloudStorage.accountIdPlaceholder')"
            allow-clear
          />
        </a-form-item>

        <a-form-item :label="$t('cloudStorage.bucketName')">
          <a-input
            v-model:value="form.bucketName"
            :placeholder="$t('cloudStorage.bucketNamePlaceholder')"
            allow-clear
          />
        </a-form-item>

        <a-form-item :label="$t('cloudStorage.accessKeyId')">
          <a-input
            v-model:value="form.accessKeyId"
            :placeholder="$t('cloudStorage.accessKeyIdPlaceholder')"
            allow-clear
          />
        </a-form-item>

        <a-form-item :label="$t('cloudStorage.secretAccessKey')">
          <a-input-password
            v-model:value="form.secretAccessKey"
            :placeholder="$t('cloudStorage.secretAccessKeyPlaceholder')"
          />
        </a-form-item>

        <a-form-item :label="$t('cloudStorage.customDomain')">
          <a-input
            v-model:value="form.customDomain"
            :placeholder="$t('cloudStorage.customDomainPlaceholder')"
            allow-clear
          />
          <div class="field-hint">{{ $t('cloudStorage.customDomainHint') }}</div>
        </a-form-item>

        <a-form-item
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
          class="actions-item"
        >
          <a-space>
            <a-button
              type="primary"
              :loading="saving"
              @click="handleSave"
            >
              {{ $t('cloudStorage.save') }}
            </a-button>
            <a-button
              :loading="testing"
              @click="handleTest"
            >
              {{ $t('cloudStorage.test') }}
            </a-button>
            <a-button
              v-if="hasSavedConfig"
              danger
              @click="handleClear"
            >
              {{ $t('cloudStorage.clear') }}
            </a-button>
          </a-space>
        </a-form-item>

        <a-form-item
          v-if="statusMessage"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-alert
            :message="statusMessage"
            :type="statusType"
            show-icon
            closable
            @close="statusMessage = ''"
          />
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const api = window.api

interface R2Form {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  customDomain: string
}

const form = ref<R2Form>({
  accountId: '',
  bucketName: '',
  accessKeyId: '',
  secretAccessKey: '',
  customDomain: ''
})

const saving = ref(false)
const testing = ref(false)
const hasSavedConfig = ref(false)
const statusMessage = ref('')
const statusType = ref<'success' | 'error' | 'info'>('info')

async function loadConfig(): Promise<void> {
  try {
    const res = await api.r2ConfigGet()
    if (res.success && res.config) {
      form.value.accountId = res.config.accountId ?? ''
      form.value.bucketName = res.config.bucketName ?? ''
      form.value.accessKeyId = res.config.accessKeyId ?? ''
      form.value.secretAccessKey = res.config.secretAccessKey ?? ''
      form.value.customDomain = res.config.customDomain ?? ''
      hasSavedConfig.value = true
    }
  } catch {
    // ignore load error
  }
}

async function handleSave(): Promise<void> {
  saving.value = true
  statusMessage.value = ''
  try {
    const res = await api.r2ConfigSet({
      accountId: form.value.accountId.trim(),
      bucketName: form.value.bucketName.trim(),
      accessKeyId: form.value.accessKeyId.trim(),
      secretAccessKey: form.value.secretAccessKey,
      customDomain: form.value.customDomain.trim() || undefined
    })
    if (res.success) {
      hasSavedConfig.value = true
      statusMessage.value = t('cloudStorage.saved')
      statusType.value = 'success'
    } else {
      statusMessage.value = res.error ?? t('cloudStorage.saveFailed')
      statusType.value = 'error'
    }
  } catch (e: any) {
    statusMessage.value = e?.message ?? t('cloudStorage.saveFailed')
    statusType.value = 'error'
  } finally {
    saving.value = false
  }
}

async function handleTest(): Promise<void> {
  testing.value = true
  statusMessage.value = ''
  try {
    const res = await api.r2ConfigTest({
      accountId: form.value.accountId.trim(),
      bucketName: form.value.bucketName.trim(),
      accessKeyId: form.value.accessKeyId.trim(),
      secretAccessKey: form.value.secretAccessKey,
      customDomain: form.value.customDomain.trim() || undefined
    })
    if (res.success) {
      statusMessage.value = t('cloudStorage.testSuccess')
      statusType.value = 'success'
    } else {
      statusMessage.value = `${t('cloudStorage.testFailed')}: ${res.error ?? ''}`
      statusType.value = 'error'
    }
  } catch (e: any) {
    statusMessage.value = `${t('cloudStorage.testFailed')}: ${e?.message ?? ''}`
    statusType.value = 'error'
  } finally {
    testing.value = false
  }
}

async function handleClear(): Promise<void> {
  try {
    await api.r2ConfigClear()
    form.value = { accountId: '', bucketName: '', accessKeyId: '', secretAccessKey: '', customDomain: '' }
    hasSavedConfig.value = false
    statusMessage.value = t('cloudStorage.cleared')
    statusType.value = 'info'
  } catch (e: any) {
    statusMessage.value = e?.message ?? t('cloudStorage.clearFailed')
    statusType.value = 'error'
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style lang="less" scoped>
.cloud-storage-settings {
  .cloud-storage-container {
    background-color: var(--bg-color);
    padding-left: 4px;
    padding-top: 4px;
  }

  .label-text {
    font-size: 20px;
    font-weight: bold;
    line-height: 1.3;
    color: var(--text-color);
  }

  .description {
    color: var(--text-color-secondary);
    font-size: 14px;
  }

  .description-item {
    margin-bottom: 8px;
  }

  .field-hint {
    font-size: 12px;
    color: var(--text-color-secondary);
    margin-top: 4px;
  }

  .actions-item {
    margin-top: 8px;
  }
}
</style>
