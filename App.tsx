/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Clock,
  FolderKanban,
  Layers,
  LayoutGrid,
  Repeat,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdBannerSlot } from './ads/AdBannerSlot';
import { AdPlacement } from './ads/admobTypes';
import { DownloadActionButtons } from './components/DownloadActionButtons';
import { PrivacySection } from './components/PrivacySection';
import { ProfileAvatar } from './components/ProfileAvatar';
import { ProfileSection } from './components/ProfileSection';
import { ToolCard } from './components/ToolCard';
import { ToolIcon } from './components/ToolIcon';
import { WorkspaceView } from './components/WorkspaceView';
import { getToolById, TOOLS_CATALOG } from './data/toolsCatalog';
import {
  loadUserProfile,
  saveUserProfile,
  UserProfile,
} from './services/profileStorage';
import {
  ProcessingResult,
  ToolCategory,
  ToolDefinition,
  ToolId,
} from './types/pdfTools';
import { formatFileSize } from './utils/formatters';

type MobileTab = 'all' | 'convert' | 'organize' | 'recent' | 'profile';

export default function App() {
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);
  const [activeCategory, setActiveCategory] = useState<ToolCategory>(
    ToolCategory.All
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentResults, setRecentResults] = useState<ProcessingResult[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile());

  const recentRef = useRef<ProcessingResult[]>([]);
  recentRef.current = recentResults;

  // Revoke session blob URLs when tab closes
  useEffect(() => {
    return () => {
      recentRef.current.forEach((res) => {
        res.artifacts.forEach((art) => URL.revokeObjectURL(art.url));
      });
    };
  }, []);

  const activeTool: ToolDefinition | null = useMemo(
    () => (activeToolId ? getToolById(activeToolId) : null),
    [activeToolId]
  );

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return TOOLS_CATALOG.filter((tool) => {
      const matchesCat =
        activeCategory === ToolCategory.All || tool.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.acceptLabel.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  const handleSelectTool = (tool: ToolDefinition) => {
    setActiveToolId(tool.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDesktopNavCategory = (cat: ToolCategory) => {
    setActiveToolId(null);
    setMobileTab(cat === ToolCategory.Convert ? 'convert' : cat === ToolCategory.Organize ? 'organize' : 'all');
    setActiveCategory(cat);
  };

  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    setActiveToolId(null);
    if (tab === 'all') setActiveCategory(ToolCategory.All);
    if (tab === 'convert') setActiveCategory(ToolCategory.Convert);
    if (tab === 'organize') setActiveCategory(ToolCategory.Organize);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResultCompleted = (res: ProcessingResult) => {
    setRecentResults((prev) => [res, ...prev].slice(0, 15));
  };

  const handleClearRecent = () => {
    recentResults.forEach((res) => {
      res.artifacts.forEach((art) => URL.revokeObjectURL(art.url));
    });
    setRecentResults([]);
  };

  const handleSaveProfile = (nextProfile: UserProfile): boolean => {
    const ok = saveUserProfile(nextProfile);
    if (ok) {
      setProfile(nextProfile);
    }
    return ok;
  };

  const handleOpenProfile = () => {
    setActiveToolId(null);
    setMobileTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isViewingToolsDirectory =
    !activeToolId && mobileTab !== 'recent' && mobileTab !== 'profile';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* Top Bar — Strict 3-Zone Contract on Desktop, Compact 48px App Bar on Mobile */}
      <header className="sticky top-0 z-30 h-12 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setActiveToolId(null);
              setMobileTab('all');
              setActiveCategory(ToolCategory.All);
            }}
            className="text-lg md:text-xl font-bold tracking-tight text-blue-700 hover:text-blue-800 transition-colors whitespace-nowrap shrink-0 min-h-[44px] flex items-center"
          >
            QuickPDF
          </button>

          {/* Zone 2: Single-Line Navigation Links (Desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => handleDesktopNavCategory(ToolCategory.All)}
              className={`hover:text-slate-900 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 py-1 ${
                isViewingToolsDirectory && activeCategory === ToolCategory.All
                  ? 'text-blue-700 font-semibold underline'
                  : ''
              }`}
            >
              All Tools
            </button>
            <button
              type="button"
              onClick={() => handleDesktopNavCategory(ToolCategory.Convert)}
              className={`hover:text-slate-900 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 py-1 ${
                isViewingToolsDirectory && activeCategory === ToolCategory.Convert
                  ? 'text-blue-700 font-semibold underline'
                  : ''
              }`}
            >
              Convert
            </button>
            <button
              type="button"
              onClick={() => handleDesktopNavCategory(ToolCategory.Organize)}
              className={`hover:text-slate-900 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 py-1 ${
                isViewingToolsDirectory && activeCategory === ToolCategory.Organize
                  ? 'text-blue-700 font-semibold underline'
                  : ''
              }`}
            >
              Organize
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveToolId(null);
                setMobileTab('recent');
              }}
              className={`hover:text-slate-900 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 py-1 ${
                !activeToolId && mobileTab === 'recent'
                  ? 'text-blue-700 font-semibold underline'
                  : ''
              }`}
            >
              Recent ({recentResults.length})
            </button>
            <button
              type="button"
              onClick={handleOpenProfile}
              className={`hover:text-slate-900 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 py-1 ${
                !activeToolId && mobileTab === 'profile'
                  ? 'text-blue-700 font-semibold underline'
                  : ''
              }`}
            >
              Profile
            </button>
          </nav>

          {/* Zone 3: Header Profile Picture & Account Trigger */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleOpenProfile}
              aria-label={`Open profile (${profile.displayName})`}
              aria-current={
                !activeToolId && mobileTab === 'profile' ? 'page' : undefined
              }
              className={`inline-flex items-center gap-2.5 min-h-[44px] min-w-[44px] px-2 sm:px-3 py-1 rounded-full transition-colors shrink-0 ${
                !activeToolId && mobileTab === 'profile'
                  ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <ProfileAvatar profile={profile} size="sm" />
              <span className="hidden sm:inline text-xs font-semibold max-w-[130px] truncate">
                {profile.displayName}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTool ? (
          <WorkspaceView
            tool={activeTool}
            defaultPageSize={profile.defaultPageSize}
            onBack={() => setActiveToolId(null)}
            onResultCompleted={handleResultCompleted}
          />
        ) : mobileTab === 'profile' ? (
          <ProfileSection
            profile={profile}
            sessionFilesCount={recentResults.length}
            onSaveProfile={handleSaveProfile}
            onBackToTools={() => handleMobileTabChange('all')}
          />
        ) : mobileTab === 'recent' ? (
          /* Session Recent Processed Files View */
          <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Recent Session Files
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Files processed during this browser session. Stored only in temporary memory and cleared when you close this tab.
                </p>
              </div>
              {recentResults.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearRecent}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 bg-white transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Clear history
                </button>
              )}
            </div>

            {recentResults.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">
                  No processed files yet
                </h2>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto mb-5">
                  Choose any PDF tool to convert, merge, split, or compress files directly on your device.
                </p>
                <button
                  type="button"
                  onClick={() => handleMobileTabChange('all')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Browse All PDF Tools
                </button>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
                {recentResults.map((res, idx) => {
                  const primaryArt =
                    res.artifacts.find((a) => a.isPrimaryArchive) ||
                    res.artifacts[0];
                  return (
                    <div
                      key={`${res.completedAt}-${idx}`}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                          <ToolIcon toolId={res.toolId} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {primaryArt?.filename || res.toolTitle}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {res.summaryText}
                          </p>
                          <p className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                            {res.toolTitle}
                            <span className="mx-1.5 font-sans" aria-hidden="true">·</span>
                            {formatFileSize(res.outputBytesTotal)}
                          </p>
                        </div>
                      </div>

                      {primaryArt && (
                        <DownloadActionButtons
                          artifact={primaryArt}
                          label="Download"
                          variant="primary"
                          isArchive={Boolean(primaryArt.isPrimaryArchive)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Home Directory of All 7 PDF Utilities */
          <>
            <section className="bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold text-blue-600 mb-2">
                      100% Free <span aria-hidden="true">·</span> Browser-Local Processing <span aria-hidden="true">·</span> Zero File Uploads
                    </p>
                    <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight [text-wrap:balance]">
                      Convert &amp; manage PDF, Word, Excel, JPG, and PNG files locally
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
                      Convert between PDF, Word (DOCX), Excel (XLSX), JPG, and PNG—plus merge, split, and compress PDFs right on your device with zero server uploads.
                    </p>
                  </div>

                  {/* Live Search Filter */}
                  <div className="w-full lg:w-80 shrink-0">
                    <div className="relative">
                      <Search
                        className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter PDF tools..."
                        aria-label="Filter PDF tools"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Interactive Segmented Category Filter */}
                <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
                  <div
                    role="tablist"
                    aria-label="Filter tools by category"
                    className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
                  >
                    {[
                      { id: ToolCategory.All, label: `All Tools (${TOOLS_CATALOG.length})` },
                      { id: ToolCategory.Convert, label: 'Convert Formats' },
                      { id: ToolCategory.Organize, label: 'Merge, Split & Compress' },
                    ].map((tab) => {
                      const active = activeCategory === tab.id;
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={active}
                          type="button"
                          onClick={() => setActiveCategory(tab.id)}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-slate-500 font-mono tabular-nums hidden sm:block">
                    Showing {filteredTools.length} of {TOOLS_CATALOG.length} tools
                  </p>
                </div>
              </div>
            </section>

            {/* Responsive 7-Tool Grid */}
            <section
              aria-label="PDF tools directory"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
            >
              {filteredTools.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                  <p className="text-base font-semibold text-slate-900">
                    No matching PDF tools found for "{searchQuery}"
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveCategory(ToolCategory.All);
                    }}
                    className="mt-4 min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Show all tools
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {filteredTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onSelect={handleSelectTool}
                    />
                  ))}
                </div>
              )}

              {/* Decoupled Native Android AdMob Slot (collapsed on web when native SDK is absent) */}
              <div className="mt-8">
                <AdBannerSlot placement={AdPlacement.HomeBottomBanner} />
              </div>
            </section>

            <PrivacySection />
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-800">QuickPDF</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Local Browser PDF & Word Utility Suite</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>Free tools</span>
            <span aria-hidden="true">·</span>
            <span>Files stay on your device</span>
            <span aria-hidden="true">·</span>
            <a
              href="/QuickPDF-Project.zip"
              download="QuickPDF-Project.zip"
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline underline-offset-4 transition-colors"
            >
              Download Project (.zip)
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar (56px height, total sticky surfaces <= 15% of mobile viewport) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-14">
          <button
            type="button"
            onClick={() => handleMobileTabChange('all')}
            className={`h-full flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              !activeToolId && mobileTab === 'all'
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Tools
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleMobileTabChange('convert')}
            className={`h-full flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              !activeToolId && mobileTab === 'convert'
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Repeat className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Convert
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleMobileTabChange('organize')}
            className={`h-full flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              !activeToolId && mobileTab === 'organize'
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Organize
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleMobileTabChange('recent')}
            className={`h-full flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              !activeToolId && mobileTab === 'recent'
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <FolderKanban className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Recent{recentResults.length > 0 ? ` (${recentResults.length})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleMobileTabChange('profile')}
            className={`h-full flex flex-col items-center justify-center min-h-[44px] transition-colors ${
              !activeToolId && mobileTab === 'profile'
                ? 'text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {profile.avatarDataUrl ? (
              <ProfileAvatar profile={profile} size="xs" />
            ) : (
              <User className="w-5 h-5" aria-hidden="true" />
            )}
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Profile
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
