import { Check, Lock, Smartphone, Zap } from 'lucide-react';

export function PrivacySection() {
  return (
    <section
      id="privacy"
      aria-labelledby="privacy-heading"
      className="border-t border-slate-200 bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-2xl mb-10">
          <h2
            id="privacy-heading"
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight [text-wrap:balance]"
          >
            Built for strict document privacy and mobile speed
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Every PDF and Word operation in QuickPDF executes locally inside your device browser memory. Confidential tax forms, signed contracts, and ID scans never leave your phone or computer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Zero Server Uploads
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Files are read directly via the HTML5 File API and processed in local memory. Nothing is transmitted to remote storage buckets.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Android & Desktop Ready
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Designed with 44px+ touch targets, safe canvas memory bounds for mobile screens, and full drag-and-drop support on desktop browsers.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Zap className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Free & Unrestricted
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              All 10 PDF, Word, Excel, JPG, and PNG utilities—including multi-file merging, ZIP splitting, and compression—are completely free with no subscriptions, watermarks, or sign-up walls.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            No account required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            No watermarks added
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            Native Android AdMob SDK bridge ready
          </span>
        </div>
      </div>
    </section>
  );
}
