import { useEffect, useState } from 'react';
import { admobService } from './admobService';
import { AdPlacement } from './admobTypes';

interface AdBannerSlotProps {
  placement: AdPlacement;
}

/**
 * Dedicated native AdMob layout mount point.
 * Renders nothing in web browsers when native Android AdMob SDK is absent.
 * Reserves exact 50px standard banner height ONLY when a real native Android AdMob bridge is active.
 */
export function AdBannerSlot({ placement }: AdBannerSlotProps) {
  const [nativeActive, setNativeActive] = useState<boolean>(() =>
    admobService.isNativeSdkActive()
  );

  useEffect(() => {
    const active = admobService.isNativeSdkActive();
    setNativeActive(active);
    if (!active) return;

    admobService.mountBanner(placement);
    return () => {
      admobService.unmountBanner(placement);
    };
  }, [placement]);

  if (!nativeActive) {
    return null;
  }

  return (
    <div
      id={`admob-slot-${placement.toLowerCase()}`}
      data-admob-placement={placement}
      aria-label="Advertisement"
      className="w-full h-[50px] shrink-0 bg-slate-100 border-t border-slate-200"
    />
  );
}
