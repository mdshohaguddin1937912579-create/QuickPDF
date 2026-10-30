import { AdMobConfig, AdPlacement, NativeAndroidAdMobBridge } from './admobTypes';

function loadAdMobConfig(): AdMobConfig {
  return {
    enabled: import.meta.env.VITE_ADMOB_ENABLED === 'true',
    bannerAdUnitId: import.meta.env.VITE_ADMOB_ANDROID_BANNER_ID || '',
    interstitialAdUnitId: import.meta.env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID || '',
  };
}

class AdMobService {
  private readonly config: AdMobConfig;

  constructor() {
    this.config = loadAdMobConfig();
  }

  private getBridge(): NativeAndroidAdMobBridge | null {
    if (typeof window === 'undefined') return null;
    if (!this.config.enabled) return null;
    const bridge = window.AndroidAdMob;
    if (!bridge || typeof bridge.isReady !== 'function') return null;
    return bridge;
  }

  /**
   * Returns true ONLY when the native Android AdMob SDK bridge is genuinely injected and ready.
   * Always returns false in standard web browsers so zero fake ads are rendered.
   */
  public isNativeSdkActive(): boolean {
    const bridge = this.getBridge();
    if (!bridge || !this.config.bannerAdUnitId) return false;
    try {
      return Boolean(bridge.isReady());
    } catch {
      return false;
    }
  }

  public mountBanner(placement: AdPlacement): void {
    const bridge = this.getBridge();
    if (!bridge || !this.config.bannerAdUnitId) return;
    try {
      bridge.mountBanner(this.config.bannerAdUnitId, placement);
    } catch {
      // Fail silently so ad bridge issues never interrupt PDF utilities
    }
  }

  public unmountBanner(placement: AdPlacement): void {
    const bridge = this.getBridge();
    if (!bridge) return;
    try {
      bridge.unmountBanner(placement);
    } catch {
      // No-op
    }
  }

  /**
   * Optional non-blocking hook after file download.
   * Never gates or delays file downloads; only notifies native Android SDK if attached.
   */
  public notifyPostDownloadAction(): void {
    const bridge = this.getBridge();
    if (!bridge || !this.config.interstitialAdUnitId) return;
    try {
      bridge.showInterstitialIfLoaded(this.config.interstitialAdUnitId);
    } catch {
      // No-op
    }
  }

  public getIntegrationStatus(): {
    sdkAttached: boolean;
    envEnabled: boolean;
  } {
    return {
      sdkAttached: this.isNativeSdkActive(),
      envEnabled: this.config.enabled,
    };
  }
}

export const admobService = new AdMobService();
