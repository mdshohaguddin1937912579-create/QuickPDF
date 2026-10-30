import { admobService } from '../ads/admobService';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  return filename.slice(0, lastDot);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ParsedPageRangeGroup {
  label: string;
  /** 0-based page indices for pdf-lib / pdfjs */
  zeroBasedIndices: number[];
}

/**
 * Parses user range expressions such as "1-3, 5, 8-10" against 1..totalPages.
 */
export function parsePageRanges(
  rawInput: string,
  totalPages: number
): ParsedPageRangeGroup[] {
  const cleaned = rawInput.trim();
  if (!cleaned) {
    throw new Error('Please enter at least one page number or range (for example: 1-3, 5).');
  }

  const parts = cleaned
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error('Please enter a valid page range such as 1-3 or 2, 4, 6.');
  }

  const groups: ParsedPageRangeGroup[] = [];

  for (const part of parts) {
    if (part.includes('-')) {
      const bounds = part.split('-').map((b) => b.trim());
      if (bounds.length !== 2 || !bounds[0] || !bounds[1]) {
        throw new Error(`Invalid range "${part}". Use the format start-end (for example: 1-4).`);
      }
      const start = Number(bounds[0]);
      const end = Number(bounds[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Page numbers in "${part}" must be whole numbers.`);
      }
      if (start < 1 || end < 1) {
        throw new Error(`Page numbers must be 1 or greater (found "${part}").`);
      }
      if (start > end) {
        throw new Error(`Start page (${start}) cannot be greater than end page (${end}) in "${part}".`);
      }
      if (end > totalPages) {
        throw new Error(
          `Page ${end} exceeds this document's length of ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}.`
        );
      }
      const indices: number[] = [];
      for (let p = start; p <= end; p++) {
        indices.push(p - 1);
      }
      groups.push({
        label: start === end ? `p${start}` : `p${start}-${end}`,
        zeroBasedIndices: indices,
      });
    } else {
      const pageNum = Number(part);
      if (!Number.isInteger(pageNum) || pageNum < 1) {
        throw new Error(`"${part}" is not a valid page number.`);
      }
      if (pageNum > totalPages) {
        throw new Error(
          `Page ${pageNum} exceeds this document's length of ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}.`
        );
      }
      groups.push({
        label: `p${pageNum}`,
        zeroBasedIndices: [pageNum - 1],
      });
    }
  }

  return groups;
}

export function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Notify optional native Android AdMob adapter (non-blocking no-op on web)
  admobService.notifyPostDownloadAction();
}
