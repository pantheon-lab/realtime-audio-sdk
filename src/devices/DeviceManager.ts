import { EventEmitter } from '@/core/EventEmitter';

interface DeviceManagerEvents {
  'device-changed': (devices: MediaDeviceInfo[]) => void;
  'device-unplugged': (deviceId: string) => void;
}

/**
 * Manages audio input devices and monitors device changes
 */
export class DeviceManager extends EventEmitter<DeviceManagerEvents> {
  private currentDeviceId: string | null = null;
  private devices: MediaDeviceInfo[] = [];

  constructor() {
    super();
    this.setupDeviceChangeListener();
  }

  /**
   * Setup listener for device changes
   */
  private setupDeviceChangeListener(): void {
    if (!navigator.mediaDevices) {
      console.warn('navigator.mediaDevices not available');
      return;
    }

    navigator.mediaDevices.addEventListener('devicechange', async () => {
      const previousDevices = this.devices;
      await this.updateDeviceList();

      // Check if current device was unplugged
      if (this.currentDeviceId) {
        const currentDeviceExists = this.devices.some(
          (d) => d.deviceId === this.currentDeviceId
        );

        if (!currentDeviceExists) {
          const wasPlugged = previousDevices.some(
            (d) => d.deviceId === this.currentDeviceId
          );

          if (wasPlugged) {
            this.emit('device-unplugged', this.currentDeviceId);
          }
        }
      }

      this.emit('device-changed', this.devices);
    });
  }

  /**
   * Update the device list
   */
  private async updateDeviceList(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((device) => device.kind === 'audioinput');
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      this.devices = [];
    }
  }

  /**
   * Get all audio input devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    await this.updateDeviceList();
    return this.devices;
  }

  /**
   * Get the default audio input device
   */
  async getDefaultDevice(): Promise<MediaDeviceInfo | null> {
    await this.updateDeviceList();

    // Try to find device with 'default' in deviceId
    const defaultDevice = this.devices.find((d) =>
      d.deviceId === 'default' || d.deviceId.includes('default')
    );

    if (defaultDevice) {
      return defaultDevice;
    }

    // Return first device if available
    return this.devices[0] || null;
  }

  /**
   * Get device by ID
   */
  async getDeviceById(deviceId: string): Promise<MediaDeviceInfo | null> {
    await this.updateDeviceList();
    return this.devices.find((d) => d.deviceId === deviceId) || null;
  }

  /**
   * Set the current device ID being used
   */
  setCurrentDevice(deviceId: string): void {
    this.currentDeviceId = deviceId;
  }

  /**
   * Get the current device ID
   */
  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }

  /**
   * Check if a device exists
   */
  async deviceExists(deviceId: string): Promise<boolean> {
    await this.updateDeviceList();
    return this.devices.some((d) => d.deviceId === deviceId);
  }

  /**
   * Request permission to access audio devices
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop all tracks immediately after getting permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      console.error('Failed to get audio permission:', error);
      return false;
    }
  }
}
