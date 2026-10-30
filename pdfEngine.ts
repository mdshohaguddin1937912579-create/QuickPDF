import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  CompressionLevel,
  ImageRenderDpi,
  JpgQualityPreset,
  OutputArtifact,
  PageOrientation,
  PageSizePreset,
  ProcessingResult,
  ProgressState,
  SelectedFileItem,
  SplitMode,
  ToolId,
  ToolOptionsState,
} from '../types/pdfTools';
import {
  createId,
  formatFileSize,
  parsePageRanges,
  stripExtension,
} from '../utils/formatters';
import { openPdfJsDocument } from './pdfjsClient';

type ProgressCallback = (state: ProgressState) => void;

const MAX_MOBILE_CANVAS_PIXELS = 14_000_000; // Safe ceiling across Android Chrome WebViews

function clampScaleForCanvasSafety(
  baseWidth: number,
  baseHeight: number,
  desiredScale: number
): number {
  const projectedPixels = baseWidth * desiredScale * (baseHeight * desiredScale);
  if (projectedPixels <= MAX_MOBILE_CANVAS_PIXELS) {
    return desiredScale;
  }
  const maxSafeScale = Math.sqrt(MAX_MOBILE_CANVAS_PIXELS / Math.max(1, baseWidth * baseHeight));
  return Math.max(0.75, maxSafeScale);
}

async function decodeImageToPdfEmbedBytes(
  file: File
): Promise<{ bytes: Uint8Array; isPng: boolean; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error(`Unable to decode image "${file.name}". Please ensure it is a valid image file.`));
      element.src = objectUrl;
    });

    const natWidth = img.naturalWidth || img.width;
    const natHeight = img.naturalHeight || img.height;
    if (!natWidth || !natHeight) {
      throw new Error(`Image "${file.name}" has invalid dimensions.`);
    }

    // Always normalize through Canvas so browser EXIF upright orientation is baked in
    // and CMYK / progressive / WebP images convert cleanly to compliant sRGB streams.
    const scale = clampScaleForCanvasSafety(natWidth, natHeight, 1);
    const targetW = Math.max(1, Math.round(natWidth * scale));
    const targetH = Math.max(1, Math.round(natHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas context is unavailable.');
    }

    const keepPng = file.type === 'image/png';
    if (!keepPng) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outMime = keepPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(`Failed to encode image "${file.name}".`))),
        outMime,
        0.92
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      isPng: keepPng,
      width: targetW,
      height: targetH,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadPdfLibDocSafely(bytes: ArrayBuffer, filename: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes.slice(0), { updateMetadata: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('encrypted')) {
      // Attempt owner-password-only recovery via pdf.js (succeeds if no user open password is required)
      const pdfHandle = await openPdfJsDocument(bytes);
      try {
        const rebuiltDoc = await PDFDocument.create();
        const numPages = pdfHandle.doc.numPages;
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdfHandle.doc.getPage(pageNum);
          const ptVp = page.getViewport({ scale: 1 });
          const safeScale = clampScaleForCanvasSafety(ptVp.width, ptVp.height, 2.0);
          const renderVp = page.getViewport({ scale: safeScale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(renderVp.width));
          canvas.height = Math.max(1, Math.floor(renderVp.height));
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: renderVp, canvas }).promise;
          const jpgBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Page encode failed'))),
              'image/jpeg',
              0.9
            );
          });
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
          const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
          const embedded = await rebuiltDoc.embedJpg(jpgBytes);
          const outPage = rebuiltDoc.addPage([ptVp.width, ptVp.height]);
          outPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: ptVp.width,
            height: ptVp.height,
          });
        }
        return rebuiltDoc;
      } finally {
        await pdfHandle.close();
      }
    }
    throw new Error(`Could not read "${filename}". Make sure it is a valid, uncorrupted PDF file.`);
  }
}

/**
 * 1. IMAGE TO PDF
 */
export async function processImageToPdf(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select at least one image to convert.');
  }

  onProgress({ percent: 5, message: 'Initializing PDF document...' });
  const pdfDoc = await PDFDocument.create();
  const totalBytesIn = items.reduce((acc, item) => acc + item.sizeBytes, 0);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const pct = Math.round(8 + (i / items.length) * 80);
    onProgress({
      percent: pct,
      message: `Embedding image ${i + 1} of ${items.length} (${item.name})...`,
    });

    const decoded = await decodeImageToPdfEmbedBytes(item.file);
    const embedded = decoded.isPng
      ? await pdfDoc.embedPng(decoded.bytes)
      : await pdfDoc.embedJpg(decoded.bytes);

    let pageW: number;
    let pageH: number;
    const margin = options.pageSize === PageSizePreset.FitImage ? 0 : options.marginPt;

    if (options.pageSize === PageSizePreset.FitImage) {
      // Scale pixels at 96 DPI -> 72 pt/inch (0.75)
      pageW = Math.max(72, decoded.width * 0.75);
      pageH = Math.max(72, decoded.height * 0.75);
    } else {
      const baseDims =
        options.pageSize === PageSizePreset.Letter
          ? { short: 612, long: 792 }
          : { short: 595.28, long: 841.89 };

      const useLandscape =
        options.orientation === PageOrientation.Landscape ||
        (options.orientation === PageOrientation.Auto && decoded.width > decoded.height);

      pageW = useLandscape ? baseDims.long : baseDims.short;
      pageH = useLandscape ? baseDims.short : baseDims.long;
    }

    const page = pdfDoc.addPage([pageW, pageH]);
    const availW = Math.max(20, pageW - margin * 2);
    const availH = Math.max(20, pageH - margin * 2);
    const fitScale = Math.min(availW / decoded.width, availH / decoded.height);
    const drawW = decoded.width * fitScale;
    const drawH = decoded.height * fitScale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    page.drawImage(embedded, {
      x,
      y,
      width: drawW,
      height: drawH,
    });
  }

  onProgress({ percent: 92, message: 'Saving PDF file...' });
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const baseName = items.length === 1 ? stripExtension(items[0].name) : 'quickpdf-images';
  const outName = `${baseName}.pdf`;

  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.ImageToPdf,
    toolTitle: 'Image to PDF',
    completedAt: Date.now(),
    summaryText: `Combined ${items.length} ${items.length === 1 ? 'image' : 'images'} into ${items.length}-page PDF (${formatFileSize(blob.size)})`,
    originalBytesTotal: totalBytesIn,
    outputBytesTotal: blob.size,
    artifacts: [
      {
        id: createId(),
        filename: outName,
        mimeType: 'application/pdf',
        blob,
        url,
        sizeBytes: blob.size,
        subtitle: `${items.length} ${items.length === 1 ? 'page' : 'pages'} · ${formatFileSize(blob.size)}`,
      },
    ],
  };
}

/**
 * 2. MERGE PDF
 */
export async function processMergePdf(
  items: SelectedFileItem[],
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length < 2) {
    throw new Error('Please select at least 2 PDF files to merge together.');
  }

  onProgress({ percent: 5, message: 'Creating merged PDF container...' });
  const mergedPdf = await PDFDocument.create();
  const totalBytesIn = items.reduce((acc, item) => acc + item.sizeBytes, 0);
  let totalPagesMerged = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress({
      percent: Math.round(10 + (i / items.length) * 78),
      message: `Merging file ${i + 1} of ${items.length} (${item.name})...`,
    });

    const buffer = await item.file.arrayBuffer();
    const srcDoc = await loadPdfLibDocSafely(buffer, item.name);
    const indices = srcDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
      totalPagesMerged++;
    }
  }

  onProgress({ percent: 92, message: 'Finalizing merged document...' });
  const mergedBytes = await mergedPdf.save({ useObjectStreams: true });
  const blob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const outName = `${stripExtension(items[0].name)}-merged.pdf`;

  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.MergePdf,
    toolTitle: 'Merge PDF',
    completedAt: Date.now(),
    summaryText: `Merged ${items.length} PDFs into 1 document (${totalPagesMerged} total pages · ${formatFileSize(blob.size)})`,
    originalBytesTotal: totalBytesIn,
    outputBytesTotal: blob.size,
    artifacts: [
      {
        id: createId(),
        filename: outName,
        mimeType: 'application/pdf',
        blob,
        url,
        sizeBytes: blob.size,
        subtitle: `${totalPagesMerged} pages · ${formatFileSize(blob.size)}`,
      },
    ],
  };
}

/**
 * 3. SPLIT PDF
 */
export async function processSplitPdf(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select a PDF file to split.');
  }

  const item = items[0];
  onProgress({ percent: 8, message: `Reading "${item.name}"...` });

  const buffer = await item.file.arrayBuffer();
  const srcDoc = await loadPdfLibDocSafely(buffer, item.name);
  const totalPages = srcDoc.getPageCount();

  if (totalPages === 0) {
    throw new Error('This PDF contains 0 pages.');
  }

  const baseName = stripExtension(item.name);

  if (options.splitMode === SplitMode.ExtractSinglePdf) {
    const groups = parsePageRanges(options.pageRangeInput, totalPages);
    const flatIndices: number[] = [];
    for (const group of groups) {
      for (const idx of group.zeroBasedIndices) {
        flatIndices.push(idx);
      }
    }

    onProgress({
      percent: 45,
      message: `Extracting ${flatIndices.length} ${flatIndices.length === 1 ? 'page' : 'pages'}...`,
    });

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, flatIndices);
    copied.forEach((p) => outDoc.addPage(p));

    onProgress({ percent: 88, message: 'Saving extracted PDF...' });
    const bytes = await outDoc.save({ useObjectStreams: true });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const labelSuffix = groups.map((g) => g.label).join('_').slice(0, 32);

    onProgress({ percent: 100, message: 'Completed!' });

    return {
      toolId: ToolId.SplitPdf,
      toolTitle: 'Split PDF',
      completedAt: Date.now(),
      summaryText: `Extracted ${flatIndices.length} of ${totalPages} pages into 1 PDF`,
      originalBytesTotal: item.sizeBytes,
      outputBytesTotal: blob.size,
      artifacts: [
        {
          id: createId(),
          filename: `${baseName}-${labelSuffix}.pdf`,
          mimeType: 'application/pdf',
          blob,
          url,
          sizeBytes: blob.size,
          subtitle: `${flatIndices.length} ${flatIndices.length === 1 ? 'page' : 'pages'} · ${formatFileSize(blob.size)}`,
        },
      ],
    };
  }

  // SplitSeparateZip or EveryPageZip
  const groups =
    options.splitMode === SplitMode.EveryPageZip
      ? Array.from({ length: totalPages }, (_, idx) => ({
          label: `page-${String(idx + 1).padStart(2, '0')}`,
          zeroBasedIndices: [idx],
        }))
      : parsePageRanges(options.pageRangeInput, totalPages);

  const individualArtifacts: OutputArtifact[] = [];
  const zip = new JSZip();

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    onProgress({
      percent: Math.round(12 + (i / groups.length) * 72),
      message: `Creating split file ${i + 1} of ${groups.length} (${group.label})...`,
    });

    const subDoc = await PDFDocument.create();
    const copied = await subDoc.copyPages(srcDoc, group.zeroBasedIndices);
    copied.forEach((p) => subDoc.addPage(p));

    const subBytes = await subDoc.save({ useObjectStreams: true });
    const subFilename = `${baseName}-${group.label}.pdf`;
    zip.file(subFilename, subBytes);

    const subBlob = new Blob([subBytes as BlobPart], { type: 'application/pdf' });
    individualArtifacts.push({
      id: createId(),
      filename: subFilename,
      mimeType: 'application/pdf',
      blob: subBlob,
      url: URL.createObjectURL(subBlob),
      sizeBytes: subBlob.size,
      subtitle: `${group.zeroBasedIndices.length} ${group.zeroBasedIndices.length === 1 ? 'page' : 'pages'} · ${formatFileSize(subBlob.size)}`,
    });
  }

  const artifacts: OutputArtifact[] = [];
  let totalOutSize = individualArtifacts.reduce((acc, a) => acc + a.sizeBytes, 0);

  if (individualArtifacts.length > 1) {
    onProgress({ percent: 90, message: 'Packaging split PDFs into ZIP archive...' });
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    totalOutSize = zipBlob.size;
    artifacts.push({
      id: createId(),
      filename: `${baseName}-split-files.zip`,
      mimeType: 'application/zip',
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      sizeBytes: zipBlob.size,
      subtitle: `ZIP Archive · ${individualArtifacts.length} PDF files · ${formatFileSize(zipBlob.size)}`,
      isPrimaryArchive: true,
    });
  }

  artifacts.push(...individualArtifacts);
  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.SplitPdf,
    toolTitle: 'Split PDF',
    completedAt: Date.now(),
    summaryText: `Split ${totalPages}-page PDF into ${individualArtifacts.length} separate PDF ${individualArtifacts.length === 1 ? 'file' : 'files'}`,
    originalBytesTotal: item.sizeBytes,
    outputBytesTotal: totalOutSize,
    artifacts,
  };
}

/**
 * Shared renderer for PDF -> PNG and PDF -> JPG
 */
async function renderPdfPagesToImageFormat(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  format: 'png' | 'jpg',
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  const formatUpper = format.toUpperCase();
  if (items.length === 0) {
    throw new Error(`Please select a PDF file to convert to ${formatUpper} images.`);
  }

  const item = items[0];
  onProgress({ percent: 5, message: `Opening "${item.name}"...` });

  const buffer = await item.file.arrayBuffer();
  const pdfHandle = await openPdfJsDocument(buffer);
  const numPages = pdfHandle.doc.numPages;

  if (numPages === 0) {
    await pdfHandle.close();
    throw new Error('This PDF contains 0 pages.');
  }

  const dpiNumeric = Number(options.renderDpi || ImageRenderDpi.Standard150);
  const baseScale = dpiNumeric / 72;
  const jpegQuality = Number(options.jpgQuality || JpgQualityPreset.Standard);
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : 'jpg';
  const baseName = stripExtension(item.name);
  const pageArtifacts: OutputArtifact[] = [];
  const zip = new JSZip();

  try {
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({
        percent: Math.round(10 + ((pageNum - 1) / numPages) * 76),
        message: `Rendering page ${pageNum} of ${numPages} to ${formatUpper}...`,
      });

      const page = await pdfHandle.doc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const safeScale = clampScaleForCanvasSafety(
        unscaledViewport.width,
        unscaledViewport.height,
        baseScale
      );
      const viewport = page.getViewport({ scale: safeScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Browser 2D canvas context is unavailable.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      }).promise;

      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error(`Failed to export ${formatUpper} for page ${pageNum}.`)),
          mimeType,
          format === 'jpg' ? jpegQuality : undefined
        );
      });

      const widthPx = canvas.width;
      const heightPx = canvas.height;
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      const outFilename = `${baseName}-page-${String(pageNum).padStart(2, '0')}.${ext}`;
      zip.file(outFilename, imageBlob);

      const imageUrl = URL.createObjectURL(imageBlob);
      pageArtifacts.push({
        id: createId(),
        filename: outFilename,
        mimeType,
        blob: imageBlob,
        url: imageUrl,
        previewImageUrl: imageUrl,
        sizeBytes: imageBlob.size,
        subtitle: `Page ${pageNum} · ${widthPx}×${heightPx} px · ${formatFileSize(imageBlob.size)}`,
      });
    }
  } finally {
    await pdfHandle.close();
  }

  const artifacts: OutputArtifact[] = [];
  let outputBytesTotal = pageArtifacts.reduce((acc, a) => acc + a.sizeBytes, 0);

  if (pageArtifacts.length > 1) {
    onProgress({
      percent: 90,
      message: `Bundling ${formatUpper} images into ZIP archive...`,
    });
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    outputBytesTotal = zipBlob.size;
    artifacts.push({
      id: createId(),
      filename: `${baseName}-${ext}-images.zip`,
      mimeType: 'application/zip',
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      sizeBytes: zipBlob.size,
      subtitle: `ZIP Archive · ${pageArtifacts.length} ${formatUpper} images · ${formatFileSize(zipBlob.size)}`,
      isPrimaryArchive: true,
    });
  }

  artifacts.push(...pageArtifacts);
  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: format === 'png' ? ToolId.PdfToImages : ToolId.PdfToJpg,
    toolTitle: format === 'png' ? 'PDF to PNG' : 'PDF to JPG',
    completedAt: Date.now(),
    summaryText: `Exported ${pageArtifacts.length} ${formatUpper} ${pageArtifacts.length === 1 ? 'image' : 'images'} at ${dpiNumeric} DPI`,
    originalBytesTotal: item.sizeBytes,
    outputBytesTotal,
    artifacts,
  };
}

/**
 * 4A. PDF TO PNG
 */
export async function processPdfToImages(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  return renderPdfPagesToImageFormat(items, options, 'png', onProgress);
}

/**
 * 4B. PDF TO JPG
 */
export async function processPdfToJpg(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  return renderPdfPagesToImageFormat(items, options, 'jpg', onProgress);
}

/**
 * 5. COMPRESS PDF
 */
export async function processCompressPdf(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select a PDF file to compress.');
  }

  const item = items[0];
  onProgress({ percent: 5, message: `Analyzing "${item.name}"...` });

  const buffer = await item.file.arrayBuffer();

  // Pass 1: Structural & metadata lossless optimization via pdf-lib
  let losslessBytes: Uint8Array | null = null;
  try {
    const cleanDoc = await PDFDocument.load(buffer.slice(0), { updateMetadata: false });
    cleanDoc.setTitle('');
    cleanDoc.setAuthor('');
    cleanDoc.setSubject('');
    cleanDoc.setKeywords([]);
    cleanDoc.setProducer('QuickPDF');
    cleanDoc.setCreator('QuickPDF');
    losslessBytes = await cleanDoc.save({ useObjectStreams: true });
  } catch {
    losslessBytes = null;
  }

  // Pass 2: Page stream re-encoding via pdf.js + optimized JPEG streams
  const presetConfig =
    options.compressionLevel === CompressionLevel.Maximum
      ? { dpi: 108, jpegQuality: 0.5 }
      : options.compressionLevel === CompressionLevel.HighQuality
      ? { dpi: 190, jpegQuality: 0.82 }
      : { dpi: 144, jpegQuality: 0.68 };

  const pdfHandle = await openPdfJsDocument(buffer);
  const numPages = pdfHandle.doc.numPages;
  const reencodedDoc = await PDFDocument.create();

  try {
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({
        percent: Math.round(12 + ((pageNum - 1) / numPages) * 76),
        message: `Optimizing page ${pageNum} of ${numPages}...`,
      });

      const page = await pdfHandle.doc.getPage(pageNum);
      const ptViewport = page.getViewport({ scale: 1 });
      const desiredScale = presetConfig.dpi / 72;
      const safeScale = clampScaleForCanvasSafety(
        ptViewport.width,
        ptViewport.height,
        desiredScale
      );
      const renderViewport = page.getViewport({ scale: safeScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Browser 2D canvas context is unavailable.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: renderViewport,
        canvas,
      }).promise;

      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Failed to compress page ${pageNum}.`))),
          'image/jpeg',
          presetConfig.jpegQuality
        );
      });

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      const jpgBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const embeddedJpg = await reencodedDoc.embedJpg(jpgBytes);
      const outPage = reencodedDoc.addPage([ptViewport.width, ptViewport.height]);
      outPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: ptViewport.width,
        height: ptViewport.height,
      });
    }
  } finally {
    await pdfHandle.close();
  }

  onProgress({ percent: 92, message: 'Selecting smallest valid PDF stream...' });
  const rasterBytes = await reencodedDoc.save({ useObjectStreams: true });

  // Choose the smaller output between raster-compressed and lossless object-stream optimized
  let bestBytes: Uint8Array = rasterBytes;
  if (losslessBytes && losslessBytes.byteLength < bestBytes.byteLength) {
    bestBytes = losslessBytes;
  }

  // Never produce a file larger than original if original was already hyper-compact
  if (bestBytes.byteLength > item.sizeBytes) {
    bestBytes = losslessBytes && losslessBytes.byteLength <= item.sizeBytes
      ? losslessBytes
      : new Uint8Array(buffer);
  }

  const blob = new Blob([bestBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const savedBytes = Math.max(0, item.sizeBytes - blob.size);
  const savedPct = item.sizeBytes > 0 ? Math.round((savedBytes / item.sizeBytes) * 100) : 0;
  const outName = `${stripExtension(item.name)}-compressed.pdf`;

  onProgress({ percent: 100, message: 'Completed!' });

  const summaryText =
    savedBytes > 0
      ? `Reduced from ${formatFileSize(item.sizeBytes)} to ${formatFileSize(blob.size)} (${savedPct}% smaller)`
      : `Document is already maximally compact (${formatFileSize(blob.size)})`;

  return {
    toolId: ToolId.CompressPdf,
    toolTitle: 'Compress PDF',
    completedAt: Date.now(),
    summaryText,
    originalBytesTotal: item.sizeBytes,
    outputBytesTotal: blob.size,
    artifacts: [
      {
        id: createId(),
        filename: outName,
        mimeType: 'application/pdf',
        blob,
        url,
        sizeBytes: blob.size,
        subtitle: `${formatFileSize(item.sizeBytes)} → ${formatFileSize(blob.size)}${savedPct > 0 ? ` · Saved ${savedPct}%` : ''}`,
      },
    ],
  };
}
