/**
 * Isolated AdMob integration contracts for future native Android SDK attachment.
 * Kept strictly decoupled from PDF processing and UI workflows.
 * No fake ads or simulated ad-verification gates are permitted.
 *
 * Example Android Kotlin WebView attachment (when wrapping QuickPDF in Android Studio):
 * ```kotlin
 * class AndroidAdMobBridge(private val activity: Activity) {
 *     @JavascriptInterface fun isReady(): Boolean = true
 *     @JavascriptInterface fun mountBanner(adUnitId: String, placement: String) { ... }
 *     @JavascriptInterface fun unmountBanner(placement: String) { ... }
 *     @JavascriptInterface fun showInterstitialIfLoaded(adUnitId: String) { ... }
 * }
 * webView.addJavascriptInterface(AndroidAdMobBridge(this), "AndroidAdMob")
 * ```
 */

export enum AdPlacement {
  HomeBottomBanner = 'HOME_BOTTOM_BANNER',
  WorkspaceBottomBanner = 'WORKSPACE_BOTTOM_BANNER',
  PostDownloadInterstitial = 'POST_DOWNLOAD_INTERSTITIAL',
}

export interface AdMobConfig {
  enabled: boolean;
  bannerAdUnitId: string;
  interstitialAdUnitId: string;
}

/**
 * Interface expected when QuickPDF is hosted inside a native Android WebView
 * (via addJavascriptInterface(bridge, "AndroidAdMob")) or Capacitor wrapper.
 */
export interface NativeAndroidAdMobBridge {
  isReady: () => boolean;
  mountBanner: (adUnitId: string, placement: string) => void;
  unmountBanner: (placement: string) => void;
  showInterstitialIfLoaded: (adUnitId: string) => void;
}

declare global {
  interface Window {
    AndroidAdMob?: NativeAndroidAdMobBridge;
  }
}
