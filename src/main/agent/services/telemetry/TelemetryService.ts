// Telemetry has been removed. This is a no-op stub to satisfy existing imports.
/* eslint-disable @typescript-eslint/no-empty-function */

export function checkIsFirstLaunch(): boolean {
  return false
}

class NoOpTelemetryClient {
  private static instance: NoOpTelemetryClient
  static getInstance(): NoOpTelemetryClient {
    if (!NoOpTelemetryClient.instance) {
      NoOpTelemetryClient.instance = new NoOpTelemetryClient()
    }
    return NoOpTelemetryClient.instance
  }
  updateTelemetryState(_enabled: boolean): void {}
  captureAppStarted(): void {}
  captureAppFirstLaunch(): void {}
  captureTaskCreated(_taskId: string, _provider?: string): void {}
  captureTaskRestarted(_taskId: string, _provider?: string): void {}
  captureTaskCompleted(_taskId: string): void {}
  captureTaskFeedback(_taskId: string, _feedbackType: string): void {}
  captureApiRequestEvent(..._args: unknown[]): void {}
  captureOptionSelected(_taskId: string, _count: number, _mode: string): void {}
  captureOptionsIgnored(_taskId: string, _count: number, _mode: string): void {}
  captureButtonClick(_button: string, _taskId?: string, _properties?: unknown): void {}
  isTelemetryEnabled(): boolean {
    return false
  }
}

export const telemetryService = NoOpTelemetryClient.getInstance()
