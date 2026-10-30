import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import {
  ExcelSheetMode,
  PageOrientation,
  PageSizePreset,
  ProcessingResult,
  ProgressState,
  SelectedFileItem,
  ToolId,
  ToolOptionsState,
} from '../types/pdfTools';
import { createId, formatFileSize, stripExtension } from '../utils/formatters';
import { openPdfJsDocument } from './pdfjsClient';

type ProgressCallback = (state: ProgressState) => void;

interface PositionedTextCell {
  text: string;
  xStart: number;
  xEnd: number;
  y: number;
  fontSize: number;
}

function parseCellValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Match pure integers or decimals with optional thousand separators (e.g. -12,450.75)
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(trimmed) || /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const cleaned = trimmed.replace(/,/g, '');
    // Avoid converting long leading-zero IDs like "00124" into numbers
    if (/^0\d+/.test(cleaned)) return trimmed;
    const numeric = Number(cleaned);
    if (Number.isFinite(numeric) && Math.abs(numeric) < 1e15) {
      return numeric;
    }
  }
  return trimmed;
}

function extractStructuredRowsFromPageItems(
  fragments: PositionedTextCell[]
): (string | number)[][] {
  if (fragments.length === 0) return [];

  // Sort top-to-bottom (higher PDF Y is higher on page), then left-to-right
  const sorted = [...fragments].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 4) {
      return b.y - a.y;
    }
    return a.xStart - b.xStart;
  });

  // Group into horizontal row baselines
  const rawRows: PositionedTextCell[][] = [];
  for (const item of sorted) {
    const currentRow = rawRows[rawRows.length - 1];
    if (
      currentRow &&
      Math.abs(currentRow[0].y - item.y) <= Math.max(4.5, item.fontSize * 0.45)
    ) {
      currentRow.push(item);
    } else {
      rawRows.push([item]);
    }
  }

  // Within each row, sort left-to-right and merge words that are part of the same phrase/cell
  const mergedCellRows: PositionedTextCell[][] = rawRows.map((row) => {
    row.sort((a, b) => a.xStart - b.xStart);
    const merged: PositionedTextCell[] = [];
    for (const frag of row) {
      const prev = merged[merged.length - 1];
      const gapThreshold = Math.max(12, frag.fontSize * 1.45);
      if (prev && frag.xStart - prev.xEnd <= gapThreshold) {
        const needsSpace =
          !prev.text.endsWith(' ') && !frag.text.startsWith(' ');
        prev.text += (needsSpace ? ' ' : '') + frag.text;
        prev.xEnd = Math.max(prev.xEnd, frag.xEnd);
        prev.fontSize = Math.max(prev.fontSize, frag.fontSize);
      } else {
        merged.push({ ...frag });
      }
    }
    return merged;
  });

  // Collect column X-anchors from multi-cell rows to align tabular columns cleanly
  const multiCellRows = mergedCellRows.filter((r) => r.length >= 2);
  if (multiCellRows.length === 0) {
    return mergedCellRows.map((r) => [parseCellValue(r[0]?.text || '')]);
  }

  const xSamples: number[] = [];
  for (const r of multiCellRows) {
    for (const cell of r) {
      xSamples.push(cell.xStart);
    }
  }
  xSamples.sort((a, b) => a - b);

  const columnAnchors: number[] = [];
  const BUCKET_TOLERANCE_PT = 26;
  for (const x of xSamples) {
    const lastAnchor = columnAnchors[columnAnchors.length - 1];
    if (lastAnchor === undefined || x - lastAnchor > BUCKET_TOLERANCE_PT) {
      columnAnchors.push(x);
    }
  }

  // Cap max detected columns to 24 for clean spreadsheet structure
  const anchors = columnAnchors.slice(0, 24);

  const outputGrid: (string | number)[][] = [];
  for (const row of mergedCellRows) {
    if (row.length === 1 && row[0].text.length > 55) {
      // Full-width title or paragraph row placed in Column A
      outputGrid.push([row[0].text.trim()]);
      continue;
    }

    const rowCells: string[] = Array.from({ length: anchors.length }, () => '');
    for (const cell of row) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < anchors.length; c++) {
        const dist = Math.abs(cell.xStart - anchors[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      rowCells[bestCol] = rowCells[bestCol]
        ? `${rowCells[bestCol]} ${cell.text.trim()}`
        : cell.text.trim();
    }

    // Trim trailing empty cells on the right
    let lastNonEmpty = rowCells.length - 1;
    while (lastNonEmpty > 0 && !rowCells[lastNonEmpty]) {
      lastNonEmpty--;
    }
    outputGrid.push(rowCells.slice(0, lastNonEmpty + 1).map(parseCellValue));
  }

  return outputGrid;
}

function computeAutoColumnWidths(rows: (string | number)[][]): XLSX.ColInfo[] {
  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 1);
  const widths: XLSX.ColInfo[] = [];
  for (let c = 0; c < maxCols; c++) {
    let maxLen = 10;
    for (const row of rows) {
      const val = row[c];
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, Math.min(46, String(val).length + 3));
      }
    }
    widths.push({ wch: maxLen });
  }
  return widths;
}

/**
 * PDF TO EXCEL (.XLSX)
 */
export async function processPdfToExcel(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select a PDF file to convert to Excel (.xlsx).');
  }

  const item = items[0];
  onProgress({ percent: 6, message: `Opening "${item.name}"...` });

  const buffer = await item.file.arrayBuffer();
  const pdfHandle = await openPdfJsDocument(buffer);
  const numPages = pdfHandle.doc.numPages;

  if (numPages === 0) {
    await pdfHandle.close();
    throw new Error('This PDF contains 0 pages.');
  }

  const workbook = XLSX.utils.book_new();
  const combinedRows: (string | number)[][] = [];
  let totalExtractedRows = 0;
  let sheetsCreated = 0;

  try {
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({
        percent: Math.round(10 + ((pageNum - 1) / numPages) * 76),
        message: `Detecting rows & columns on page ${pageNum} of ${numPages}...`,
      });

      const page = await pdfHandle.doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const fragments: PositionedTextCell[] = [];

      for (const rawItem of textContent.items) {
        if (!('str' in rawItem)) continue;
        const str = rawItem.str;
        if (!str || !str.trim()) continue;
        const transform = rawItem.transform;
        const fontSize = Math.max(8, Math.round(Math.hypot(transform[0], transform[1]) || 10));
        const xStart = transform[4];
        const width = rawItem.width > 0 ? rawItem.width : str.length * fontSize * 0.52;

        fragments.push({
          text: str.trim(),
          xStart,
          xEnd: xStart + width,
          y: transform[5],
          fontSize,
        });
      }

      const pageRows = extractStructuredRowsFromPageItems(fragments);
      totalExtractedRows += pageRows.length;

      if (options.excelSheetMode === ExcelSheetMode.PerPageSheets) {
        const sheetRows =
          pageRows.length > 0
            ? pageRows
            : [['(No selectable text or table cells detected on this scanned PDF page)']];
        const ws = XLSX.utils.aoa_to_sheet(sheetRows);
        ws['!cols'] = computeAutoColumnWidths(sheetRows);
        const sheetName = `Page ${pageNum}`.slice(0, 31);
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
        sheetsCreated++;
      } else {
        if (numPages > 1 && pageRows.length > 0) {
          if (combinedRows.length > 0) {
            combinedRows.push([]);
          }
          combinedRows.push([`--- Page ${pageNum} ---`]);
        }
        combinedRows.push(...pageRows);
      }

      page.cleanup();
    }
  } finally {
    await pdfHandle.close();
  }

  if (options.excelSheetMode === ExcelSheetMode.SingleCombinedSheet) {
    const finalRows =
      combinedRows.length > 0
        ? combinedRows
        : [['(No selectable text or table cells detected in this scanned PDF)']];
    const ws = XLSX.utils.aoa_to_sheet(finalRows);
    ws['!cols'] = computeAutoColumnWidths(finalRows);
    XLSX.utils.book_append_sheet(workbook, ws, 'Extracted Data');
    sheetsCreated = 1;
  }

  onProgress({ percent: 90, message: 'Writing Excel (.xlsx) workbook...' });

  const xlsxBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  }) as ArrayBuffer;

  const mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([xlsxBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const outName = `${stripExtension(item.name)}.xlsx`;

  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.PdfToExcel,
    toolTitle: 'PDF to Excel (XLSX)',
    completedAt: Date.now(),
    summaryText: `Extracted ${totalExtractedRows} ${totalExtractedRows === 1 ? 'row' : 'rows'} across ${sheetsCreated} Excel ${sheetsCreated === 1 ? 'sheet' : 'sheets'} (${formatFileSize(blob.size)})`,
    originalBytesTotal: item.sizeBytes,
    outputBytesTotal: blob.size,
    artifacts: [
      {
        id: createId(),
        filename: outName,
        mimeType,
        blob,
        url,
        sizeBytes: blob.size,
        subtitle: `XLSX · ${sheetsCreated} ${sheetsCreated === 1 ? 'sheet' : 'sheets'} · ${totalExtractedRows} rows · ${formatFileSize(blob.size)}`,
      },
    ],
  };
}

/**
 * EXCEL (.XLSX / .XLS / .CSV / .ODS) TO PDF
 */
export async function processExcelToPdf(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select an Excel (.xlsx, .xls) or CSV file to convert.');
  }

  const item = items[0];
  onProgress({ percent: 10, message: `Reading spreadsheet "${item.name}"...` });

  let workbook: XLSX.WorkBook;
  try {
    const arrayBuffer = await item.file.arrayBuffer();
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  } catch {
    throw new Error(
      `Could not parse "${item.name}". Please ensure it is a valid, unencrypted Excel (.xlsx, .xls) or CSV spreadsheet.`
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('This spreadsheet contains no worksheets.');
  }

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Fallback to system fonts
    }
  }

  const baseDims =
    options.wordPageSize === PageSizePreset.Letter
      ? { short: 612, long: 792 }
      : { short: 595.28, long: 841.89 };

  const isLandscape = options.excelOrientation !== PageOrientation.Portrait;
  const pageWidthPt = isLandscape ? baseDims.long : baseDims.short;
  const pageHeightPt = isLandscape ? baseDims.short : baseDims.long;

  const RENDER_SCALE = 2.25;
  const marginPt = 38;
  const usableWidthPt = pageWidthPt - marginPt * 2;
  const bottomLimitPt = pageHeightPt - marginPt - 18;

  const canvases: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let cursorYPt = marginPt;

  const startNewPage = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(pageWidthPt * RENDER_SCALE);
    c.height = Math.round(pageHeightPt * RENDER_SCALE);
    const context = c.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Browser 2D canvas context is unavailable.');
    }
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, c.width, c.height);
    context.scale(RENDER_SCALE, RENDER_SCALE);
    context.textBaseline = 'alphabetic';
    canvases.push(c);
    ctx = context;
    cursorYPt = marginPt;
  };

  let renderedSheetCount = 0;
  let totalRowsRendered = 0;

  for (let sIdx = 0; sIdx < workbook.SheetNames.length; sIdx++) {
    const sheetName = workbook.SheetNames[sIdx];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    onProgress({
      percent: Math.round(25 + (sIdx / workbook.SheetNames.length) * 50),
      message: `Formatting worksheet "${sheetName}" (${sIdx + 1} of ${workbook.SheetNames.length})...`,
    });

    const rawGrid = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    // Filter out completely blank trailing rows and determine max active columns
    const cleanedRows: string[][] = [];
    let maxColCount = 0;
    for (const r of rawGrid) {
      if (!Array.isArray(r)) continue;
      let lastNonBlank = r.length - 1;
      while (lastNonBlank >= 0 && !String(r[lastNonBlank] ?? '').trim()) {
        lastNonBlank--;
      }
      if (lastNonBlank >= 0) {
        const sliced = r
          .slice(0, lastNonBlank + 1)
          .map((cell) => String(cell ?? '').trim());
        cleanedRows.push(sliced);
        maxColCount = Math.max(maxColCount, sliced.length);
      }
    }

    if (cleanedRows.length === 0 || maxColCount === 0) {
      continue;
    }

    renderedSheetCount++;
    startNewPage();

    // Draw Worksheet Title Header
    ctx.fillStyle = '#1D4ED8';
    ctx.font = '700 13px "Plus Jakarta Sans", -apple-system, sans-serif';
    ctx.fillText(sheetName, marginPt, cursorYPt + 13);
    cursorYPt += 22;

    // Cap columns per horizontal table width cleanly and compute proportional widths
    const colCount = Math.min(maxColCount, 18);
    const colWeights: number[] = Array.from({ length: colCount }, () => 6);
    const sampleLimit = Math.min(cleanedRows.length, 60);
    for (let r = 0; r < sampleLimit; r++) {
      for (let c = 0; c < colCount; c++) {
        const len = (cleanedRows[r][c] || '').length;
        colWeights[c] = Math.max(colWeights[c], Math.min(34, len + 2));
      }
    }
    const weightSum = colWeights.reduce((acc, w) => acc + w, 0) || 1;
    const colWidthsPt = colWeights.map((w) => (w / weightSum) * usableWidthPt);

    const fontSizePt = colCount > 10 ? 7.5 : colCount > 7 ? 8.5 : 9.5;
    const lineHeightPt = fontSizePt * 1.32;
    const cellPadX = 5;
    const cellPadY = 4.5;

    const wrapRowCells = (rowCells: string[], bold: boolean) => {
      ctx.font = `${bold ? '700' : '400'} ${fontSizePt}px "Plus Jakarta Sans", -apple-system, sans-serif`;
      const wrappedPerCol: string[][] = [];
      let maxLines = 1;

      for (let c = 0; c < colCount; c++) {
        const rawText = rowCells[c] || '';
        const availW = Math.max(16, colWidthsPt[c] - cellPadX * 2);
        if (!rawText) {
          wrappedPerCol.push(['']);
          continue;
        }

        const words = rawText.split(/\s+/);
        const lines: string[] = [];
        let cur = '';
        for (const word of words) {
          const candidate = cur ? `${cur} ${word}` : word;
          if (ctx.measureText(candidate).width <= availW) {
            cur = candidate;
          } else {
            if (cur) lines.push(cur);
            // Break extra-long unbroken tokens (like URLs or IDs)
            if (ctx.measureText(word).width > availW && word.length > 8) {
              let chunk = '';
              for (const ch of word) {
                if (ctx.measureText(chunk + ch).width <= availW) {
                  chunk += ch;
                } else {
                  if (chunk) lines.push(chunk);
                  chunk = ch;
                }
              }
              cur = chunk;
            } else {
              cur = word;
            }
          }
        }
        if (cur) lines.push(cur);
        const cappedLines = lines.slice(0, 6);
        wrappedPerCol.push(cappedLines);
        maxLines = Math.max(maxLines, cappedLines.length);
      }

      const rowHeightPt = maxLines * lineHeightPt + cellPadY * 2;
      return { wrappedPerCol, rowHeightPt };
    };

    const drawRowAtCursor = (
      wrappedPerCol: string[][],
      rowHeightPt: number,
      isHeader: boolean,
      rowIndex: number
    ) => {
      let xCursor = marginPt;
      for (let c = 0; c < colCount; c++) {
        const w = colWidthsPt[c];
        if (isHeader) {
          ctx.fillStyle = '#EFF6FF';
          ctx.fillRect(xCursor, cursorYPt, w, rowHeightPt);
        } else if (rowIndex % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(xCursor, cursorYPt, w, rowHeightPt);
        }

        ctx.strokeStyle = isHeader ? '#93C5FD' : '#E2E8F0';
        ctx.lineWidth = 0.65;
        ctx.strokeRect(xCursor, cursorYPt, w, rowHeightPt);

        ctx.fillStyle = isHeader ? '#1E3A8A' : '#0F172A';
        ctx.font = `${isHeader ? '700' : '400'} ${fontSizePt}px "Plus Jakarta Sans", -apple-system, sans-serif`;

        const lines = wrappedPerCol[c];
        for (let l = 0; l < lines.length; l++) {
          ctx.fillText(
            lines[l],
            xCursor + cellPadX,
            cursorYPt + cellPadY + fontSizePt + l * lineHeightPt
          );
        }
        xCursor += w;
      }
      cursorYPt += rowHeightPt;
    };

    const headerData = cleanedRows[0];
    const headerLayout = wrapRowCells(headerData, true);

    for (let rIdx = 0; rIdx < cleanedRows.length; rIdx++) {
      const isHeader = rIdx === 0;
      const layout = isHeader
        ? headerLayout
        : wrapRowCells(cleanedRows[rIdx], false);

      if (cursorYPt + layout.rowHeightPt > bottomLimitPt) {
        startNewPage();
        // Repeat table header row at top of continuation page
        if (!isHeader) {
          drawRowAtCursor(headerLayout.wrappedPerCol, headerLayout.rowHeightPt, true, 0);
        }
      }

      drawRowAtCursor(layout.wrappedPerCol, layout.rowHeightPt, isHeader, rIdx);
      totalRowsRendered++;
    }
  }

  if (canvases.length === 0) {
    startNewPage();
    ctx.fillStyle = '#475569';
    ctx.font = '400 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Spreadsheet contained no non-empty cells.', marginPt, marginPt + 20);
  }

  // Draw page numbers across all pages
  for (let i = 0; i < canvases.length; i++) {
    const pageCtx = canvases[i].getContext('2d');
    if (pageCtx) {
      pageCtx.fillStyle = '#64748B';
      pageCtx.font = '400 8.5px "Plus Jakarta Sans", sans-serif';
      const footer = `${stripExtension(item.name)} · Page ${i + 1} of ${canvases.length}`;
      const textW = pageCtx.measureText(footer).width;
      pageCtx.fillText(footer, (pageWidthPt - textW) / 2, pageHeightPt - 18);
    }
  }

  onProgress({ percent: 84, message: `Encoding ${canvases.length}-page PDF document...` });
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    const jpgBlob = await new Promise<Blob>((resolve, reject) => {
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode PDF page.'))),
        'image/jpeg',
        0.92
      );
    });
    c.width = 0;
    c.height = 0;

    const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
    const embedded = await pdfDoc.embedJpg(jpgBytes);
    const pdfPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pdfPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const outName = `${stripExtension(item.name)}.pdf`;

  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.ExcelToPdf,
    toolTitle: 'Excel to PDF',
    completedAt: Date.now(),
    summaryText: `Converted ${renderedSheetCount} ${renderedSheetCount === 1 ? 'sheet' : 'sheets'} (${totalRowsRendered} rows) into a ${canvases.length}-page PDF`,
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
        subtitle: `${canvases.length} ${canvases.length === 1 ? 'page' : 'pages'} · ${formatFileSize(blob.size)}`,
      },
    ],
  };
}
