import { Download, FileArchive, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { admobService } from '../ads/admobService';
import { OutputArtifact } from '../types/pdfTools';

interface DownloadActionButtonsProps {
  artifact: OutputArtifact;
  label: string;
  variant?: 'primary' | 'secondary' | 'compact';
  isArchive?: boolean;
}

export function DownloadActionButtons({
  artifact,
  label,
  variant = 'primary',
  isArchive = false,
}: DownloadActionButtonsProps) {
  const canShareFile = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
      return false;
    }
    try {
      const testFile = new File([artifact.blob], artifact.filename, {
        type: artifact.mimeType,
      });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }, [artifact.blob, artifact.filename, artifact.mimeType]);

  const handleShare = async () => {
    try {
      const shareFile = new File([artifact.blob], artifact.filename, {
        type: artifact.mimeType,
      });
      await navigator.share({
        files: [shareFile],
        title: artifact.filename,
      });
      admobService.notifyPostDownloadAction();
    } catch {
      // User dismissed native share sheet
    }
  };

  const anchorClassName =
    variant === 'compact'
      ? 'flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-300 hover:border-blue-600 hover:text-blue-700 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap'
      : variant === 'secondary'
      ? 'inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold transition-colors whitespace-nowrap shrink-0'
      : 'inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0';

  return (
    <div className={`flex items-center gap-2 ${variant === 'compact' ? 'w-full' : 'shrink-0'}`}>
      <a
        href={artifact.url}
        download={artifact.filename}
        onClick={() => admobService.notifyPostDownloadAction()}
        className={anchorClassName}
      >
        {isArchive ? (
          <FileArchive className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Download className={variant === 'compact' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
        )}
        {label}
      </a>

      {canShareFile && (
        <button
          type="button"
          onClick={handleShare}
          aria-label={`Share ${artifact.filename}`}
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center transition-colors shrink-0"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
