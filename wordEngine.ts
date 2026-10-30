import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import mammoth from 'mammoth/mammoth.browser';
import { PDFDocument } from 'pdf-lib';
import {
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

interface ExtractedTextFragment {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

interface ReconstructedLine {
  y: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  text: string;
}

/**
 * 6. PDF TO WORD (.DOCX)
 */
export async function processPdfToWord(
  items: SelectedFileItem[],
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select a PDF file to convert to Word (.docx).');
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

  const docChildren: Paragraph[] = [];
  let editableParagraphCount = 0;
  let scannedPageImageCount = 0;

  try {
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({
        percent: Math.round(10 + ((pageNum - 1) / numPages) * 76),
        message: `Extracting text & structure from page ${pageNum} of ${numPages}...`,
      });

      const page = await pdfHandle.doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const fragments: ExtractedTextFragment[] = [];

      for (const rawItem of textContent.items) {
        if (!('str' in rawItem)) continue;
        const str = rawItem.str;
        if (!str || !str.trim()) continue;

        const transform = rawItem.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
        const fontSize = Math.max(8, Math.round(Math.hypot(transform[0], transform[1]) || 11));
        const fontNameLower = (rawItem.fontName || '').toLowerCase();
        const bold = fontNameLower.includes('bold') || fontNameLower.includes('black') || fontNameLower.includes('demi');
        const italic = fontNameLower.includes('italic') || fontNameLower.includes('oblique');

        fragments.push({
          text: str,
          x: transform[4],
          y: transform[5],
          fontSize,
          bold,
          italic,
        });
      }

      if (fragments.length > 0) {
        // Sort top-to-bottom (higher PDF Y is higher on page), then left-to-right
        fragments.sort((a, b) => {
          if (Math.abs(b.y - a.y) > 3.5) {
            return b.y - a.y;
          }
          return a.x - b.x;
        });

        // Group fragments into horizontal lines
        const lines: ReconstructedLine[] = [];
        for (const frag of fragments) {
          const lastLine = lines[lines.length - 1];
          if (lastLine && Math.abs(lastLine.y - frag.y) <= Math.max(4, frag.fontSize * 0.35)) {
            const needsSpace =
              !lastLine.text.endsWith(' ') &&
              !lastLine.text.endsWith('-') &&
              !frag.text.startsWith(' ');
            lastLine.text += (needsSpace ? ' ' : '') + frag.text;
            lastLine.fontSize = Math.max(lastLine.fontSize, frag.fontSize);
            lastLine.bold = lastLine.bold || frag.bold;
            lastLine.italic = lastLine.italic || frag.italic;
          } else {
            lines.push({
              y: frag.y,
              fontSize: frag.fontSize,
              bold: frag.bold,
              italic: frag.italic,
              text: frag.text.trim(),
            });
          }
        }

        // Determine median body font size on page
        const sortedSizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
        const bodyFontSize = sortedSizes[Math.floor(sortedSizes.length / 2)] || 11;

        // Merge consecutive body lines into paragraphs when vertical gap is small
        let idx = 0;
        while (idx < lines.length) {
          const current = lines[idx];
          const isHeading1 = current.fontSize >= bodyFontSize * 1.45;
          const isHeading2 = !isHeading1 && (current.fontSize >= bodyFontSize * 1.2 || (current.bold && current.text.length < 90));

          if (isHeading1 || isHeading2) {
            docChildren.push(
              new Paragraph({
                heading: isHeading1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 120 },
                children: [
                  new TextRun({
                    text: current.text,
                    bold: true,
                    italics: current.italic,
                    size: Math.round(current.fontSize * 2),
                  }),
                ],
              })
            );
            editableParagraphCount++;
            idx++;
            continue;
          }

          let combinedText = current.text;
          let prevY = current.y;
          let nextIdx = idx + 1;

          while (nextIdx < lines.length) {
            const candidate = lines[nextIdx];
            const verticalGap = Math.abs(prevY - candidate.y);
            const candidateIsHeading = candidate.fontSize >= bodyFontSize * 1.2;
            const looksLikeListBullet = /^([•\-*▪]|\d+[.)])\s/.test(candidate.text);

            if (
              candidateIsHeading ||
              looksLikeListBullet ||
              verticalGap > bodyFontSize * 1.85
            ) {
              break;
            }

            if (combinedText.endsWith('-')) {
              combinedText = combinedText.slice(0, -1) + candidate.text;
            } else {
              combinedText += ' ' + candidate.text;
            }
            prevY = candidate.y;
            nextIdx++;
          }

          docChildren.push(
            new Paragraph({
              spacing: { after: 160, line: 276 },
              children: [
                new TextRun({
                  text: combinedText,
                  bold: current.bold,
                  italics: current.italic,
                  size: Math.round(Math.min(14, Math.max(10, current.fontSize)) * 2),
                }),
              ],
            })
          );
          editableParagraphCount++;
          idx = nextIdx;
        }
      } else {
        // Scanned / image-only PDF page fallback: embed crisp rendered snapshot so page is never blank
        const ptViewport = page.getViewport({ scale: 1 });
        const renderScale = Math.min(2.0, 1200 / Math.max(1, ptViewport.width));
        const renderViewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

          const pngBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/png')
          );

          if (pngBlob) {
            const imgBytes = new Uint8Array(await pngBlob.arrayBuffer());
            const maxWordWidthPx = 580;
            const aspect = canvas.height / Math.max(1, canvas.width);
            const targetW = Math.min(maxWordWidthPx, canvas.width);
            const targetH = Math.round(targetW * aspect);

            docChildren.push(
              new Paragraph({
                spacing: { after: 120 },
                children: [
                  new ImageRun({
                    type: 'png',
                    data: imgBytes,
                    transformation: { width: targetW, height: targetH },
                  }),
                ],
              })
            );
            scannedPageImageCount++;
          }
        }
        canvas.width = 0;
        canvas.height = 0;
      }

      if (pageNum < numPages) {
        docChildren.push(
          new Paragraph({
            children: [new PageBreak()],
          })
        );
      }

      page.cleanup();
    }
  } finally {
    await pdfHandle.close();
  }

  onProgress({ percent: 90, message: 'Building OpenXML Word (.docx) package...' });

  const wordDoc = new Document({
    creator: 'QuickPDF',
    title: stripExtension(item.name),
    sections: [
      {
        properties: {},
        children:
          docChildren.length > 0
            ? docChildren
            : [
                new Paragraph({
                  children: [new TextRun({ text: 'No content detected in source PDF.' })],
                }),
              ],
      },
    ],
  });

  const docxBlob = await Packer.toBlob(wordDoc);
  const url = URL.createObjectURL(docxBlob);
  const outName = `${stripExtension(item.name)}.docx`;

  onProgress({ percent: 100, message: 'Completed!' });

  const detailParts: string[] = [];
  if (editableParagraphCount > 0) {
    detailParts.push(`${editableParagraphCount} editable ${editableParagraphCount === 1 ? 'block' : 'blocks'}`);
  }
  if (scannedPageImageCount > 0) {
    detailParts.push(`${scannedPageImageCount} scanned ${scannedPageImageCount === 1 ? 'page image' : 'page images'}`);
  }

  return {
    toolId: ToolId.PdfToWord,
    toolTitle: 'PDF to Word',
    completedAt: Date.now(),
    summaryText: `Converted ${numPages}-page PDF to Word (${detailParts.join(' + ') || 'DOCX'})`,
    originalBytesTotal: item.sizeBytes,
    outputBytesTotal: docxBlob.size,
    artifacts: [
      {
        id: createId(),
        filename: outName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        blob: docxBlob,
        url,
        sizeBytes: docxBlob.size,
        subtitle: `DOCX · ${numPages} ${numPages === 1 ? 'page' : 'pages'} · ${formatFileSize(docxBlob.size)}`,
      },
    ],
  };
}

/**
 * 7. WORD (.DOCX / .TXT) TO PDF
 * Uses mammoth HTML AST + high-DPI Canvas 2D print typesetter for 100% Unicode script,
 * heading, inline run, list, table, and image fidelity.
 */
interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

type DocBlock =
  | {
      kind: 'paragraph';
      spans: InlineSpan[];
      fontSizePt: number;
      lineHeightFactor: number;
      spaceBeforePt: number;
      spaceAfterPt: number;
      indentPt: number;
      bulletPrefix?: string;
    }
  | {
      kind: 'table';
      rows: { cells: string[]; isHeader: boolean }[];
    }
  | {
      kind: 'image';
      src: string;
    };

function extractInlineSpans(
  node: Node,
  inherited: { bold: boolean; italic: boolean; underline: boolean }
): InlineSpan[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    const normalized = raw.replace(/\s+/g, ' ');
    if (!normalized) return [];
    return [{ text: normalized, ...inherited }];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return [{ text: '\n', ...inherited }];
  }

  const nextStyle = {
    bold: inherited.bold || tag === 'strong' || tag === 'b' || /^h[1-6]$/.test(tag),
    italic: inherited.italic || tag === 'em' || tag === 'i',
    underline: inherited.underline || tag === 'u',
  };

  const out: InlineSpan[] = [];
  el.childNodes.forEach((child) => {
    out.push(...extractInlineSpans(child, nextStyle));
  });
  return out;
}

function parseHtmlToBlocks(html: string): DocBlock[] {
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const blocks: DocBlock[] = [];

  function walkBlockElement(el: Element, listIndentLevel = 0): void {
    const tag = el.tagName.toLowerCase();

    // Check embedded images inside paragraphs or standalone
    const imgs = tag === 'img' ? [el as HTMLImageElement] : Array.from(el.querySelectorAll('img'));

    if (tag === 'table') {
      const rows: { cells: string[]; isHeader: boolean }[] = [];
      const trList = Array.from(el.querySelectorAll('tr'));
      for (const tr of trList) {
        const ths = Array.from(tr.querySelectorAll('th'));
        const tds = Array.from(tr.querySelectorAll('td'));
        const cellNodes = ths.length > 0 ? ths : tds;
        if (cellNodes.length > 0) {
          rows.push({
            isHeader: ths.length > 0,
            cells: cellNodes.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()),
          });
        }
      }
      if (rows.length > 0) {
        blocks.push({ kind: 'table', rows });
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol';
      let itemIndex = 1;
      Array.from(el.children).forEach((child) => {
        if (child.tagName.toLowerCase() === 'li') {
          const spans = extractInlineSpans(child, {
            bold: false,
            italic: false,
            underline: false,
          });
          if (spans.length > 0) {
            blocks.push({
              kind: 'paragraph',
              spans,
              fontSizePt: 11,
              lineHeightFactor: 1.45,
              spaceBeforePt: 2,
              spaceAfterPt: 5,
              indentPt: 18 + listIndentLevel * 16,
              bulletPrefix: isOrdered ? `${itemIndex}. ` : '• ',
            });
          }
          itemIndex++;
        }
      });
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const sizeMap: Record<number, number> = {
        1: 20,
        2: 16,
        3: 14,
        4: 12.5,
        5: 11.5,
        6: 11,
      };
      const spans = extractInlineSpans(el, { bold: true, italic: false, underline: false });
      if (spans.length > 0) {
        blocks.push({
          kind: 'paragraph',
          spans,
          fontSizePt: sizeMap[level] || 13,
          lineHeightFactor: 1.3,
          spaceBeforePt: level <= 2 ? 14 : 10,
          spaceAfterPt: 6,
          indentPt: 0,
        });
      }
      return;
    }

    if (tag === 'p' || tag === 'blockquote' || tag === 'pre') {
      const spans = extractInlineSpans(el, {
        bold: false,
        italic: tag === 'blockquote',
        underline: false,
      });
      const joined = spans.map((s) => s.text).join('').trim();
      if (joined.length > 0) {
        blocks.push({
          kind: 'paragraph',
          spans,
          fontSizePt: 11,
          lineHeightFactor: 1.5,
          spaceBeforePt: 0,
          spaceAfterPt: 8,
          indentPt: tag === 'blockquote' ? 18 : 0,
        });
      }
      for (const img of imgs) {
        if (img.src) {
          blocks.push({ kind: 'image', src: img.src });
        }
      }
      return;
    }

    if (tag === 'img') {
      const src = (el as HTMLImageElement).src;
      if (src) blocks.push({ kind: 'image', src });
      return;
    }

    // Container fallback (div, section, article)
    if (el.children.length > 0) {
      Array.from(el.children).forEach((child) => walkBlockElement(child, listIndentLevel));
    } else {
      const text = (el.textContent || '').trim();
      if (text) {
        blocks.push({
          kind: 'paragraph',
          spans: [{ text, bold: false, italic: false, underline: false }],
          fontSizePt: 11,
          lineHeightFactor: 1.5,
          spaceBeforePt: 0,
          spaceAfterPt: 8,
          indentPt: 0,
        });
      }
    }
  }

  Array.from(dom.body.children).forEach((el) => walkBlockElement(el));
  return blocks;
}

function buildFontString(span: InlineSpan, pxSize: number): string {
  const style = span.italic ? 'italic ' : '';
  const weight = span.bold ? '700 ' : '400 ';
  return `${style}${weight}${pxSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

export async function processWordToPdf(
  items: SelectedFileItem[],
  options: ToolOptionsState,
  onProgress: ProgressCallback
): Promise<ProcessingResult> {
  if (items.length === 0) {
    throw new Error('Please select a Word (.docx) file to convert.');
  }

  const item = items[0];
  const lowerName = item.name.toLowerCase();

  if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    throw new Error(
      'Legacy Word 97-2003 (.doc) binary format is not supported in browser mode. Please save the file as .docx and try again.'
    );
  }

  onProgress({ percent: 10, message: `Reading "${item.name}"...` });

  let htmlContent = '';
  if (lowerName.endsWith('.txt') || item.file.type === 'text/plain') {
    const rawText = await item.file.text();
    const paragraphs = rawText.split(/\r?\n\r?\n/);
    htmlContent = paragraphs
      .map((p) => {
        const escaped = p
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r?\n/g, '<br/>');
        return `<p>${escaped}</p>`;
      })
      .join('');
  } else {
    try {
      const arrayBuffer = await item.file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      htmlContent = result.value;
    } catch {
      throw new Error(
        `Could not parse "${item.name}". Please ensure it is a valid, unencrypted Microsoft Word (.docx) document.`
      );
    }
  }

  onProgress({ percent: 35, message: 'Typesetting document layout and pagination...' });

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Continue with fallback system fonts if font readiness rejects
    }
  }

  const blocks = parseHtmlToBlocks(htmlContent);
  if (blocks.length === 0) {
    blocks.push({
      kind: 'paragraph',
      spans: [{ text: '(Empty document)', bold: false, italic: true, underline: false }],
      fontSizePt: 11,
      lineHeightFactor: 1.5,
      spaceBeforePt: 0,
      spaceAfterPt: 8,
      indentPt: 0,
    });
  }

  const pageDims =
    options.wordPageSize === PageSizePreset.Letter
      ? { widthPt: 612, heightPt: 792 }
      : { widthPt: 595.28, heightPt: 841.89 };

  const RENDER_SCALE = 2.25; // Crisp ~162 DPI print output
  const marginPt = 52;
  const contentWidthPt = pageDims.widthPt - marginPt * 2;
  const bottomLimitPt = pageDims.heightPt - marginPt - 18;

  const canvases: HTMLCanvasElement[] = [];
  let currentCanvas!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let cursorYPt = marginPt;

  const startNewPage = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(pageDims.widthPt * RENDER_SCALE);
    c.height = Math.round(pageDims.heightPt * RENDER_SCALE);
    const context = c.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Browser 2D canvas context is unavailable.');
    }
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, c.width, c.height);
    context.scale(RENDER_SCALE, RENDER_SCALE);
    context.textBaseline = 'alphabetic';
    canvases.push(c);
    currentCanvas = c;
    ctx = context;
    cursorYPt = marginPt;
  };

  startNewPage();

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    if (bIdx % 12 === 0) {
      onProgress({
        percent: Math.round(40 + (bIdx / blocks.length) * 35),
        message: `Typesetting section ${bIdx + 1} of ${blocks.length}...`,
      });
    }

    if (block.kind === 'paragraph') {
      cursorYPt += block.spaceBeforePt;
      const lineHeightPt = block.fontSizePt * block.lineHeightFactor;
      const startXPt = marginPt + block.indentPt;
      const maxLineWidthPt = Math.max(80, pageDims.widthPt - marginPt - startXPt);

      // Tokenize spans into words preserving whitespace & line breaks
      interface StyledToken {
        word: string;
        span: InlineSpan;
        isNewline?: boolean;
      }
      const tokens: StyledToken[] = [];
      for (const span of block.spans) {
        if (span.text === '\n') {
          tokens.push({ word: '', span, isNewline: true });
          continue;
        }
        const parts = span.text.split(/(\s+)/);
        for (const part of parts) {
          if (!part) continue;
          tokens.push({ word: part, span });
        }
      }

      // Wrap tokens into rendered lines
      interface PositionedRun {
        text: string;
        xPt: number;
        widthPt: number;
        span: InlineSpan;
      }
      const wrappedLines: PositionedRun[][] = [];
      let activeLine: PositionedRun[] = [];
      let lineXOffset = 0;

      for (const token of tokens) {
        if (token.isNewline) {
          wrappedLines.push(activeLine);
          activeLine = [];
          lineXOffset = 0;
          continue;
        }

        if (activeLine.length === 0 && /^\s+$/.test(token.word)) {
          continue;
        }

        ctx.font = buildFontString(token.span, block.fontSizePt);
        const tokenWidth = ctx.measureText(token.word).width;

        if (activeLine.length > 0 && lineXOffset + tokenWidth > maxLineWidthPt) {
          wrappedLines.push(activeLine);
          activeLine = [];
          lineXOffset = 0;
          if (/^\s+$/.test(token.word)) {
            continue;
          }
        }

        activeLine.push({
          text: token.word,
          xPt: startXPt + lineXOffset,
          widthPt: tokenWidth,
          span: token.span,
        });
        lineXOffset += tokenWidth;
      }
      if (activeLine.length > 0) {
        wrappedLines.push(activeLine);
      }

      for (let lineIdx = 0; lineIdx < wrappedLines.length; lineIdx++) {
        if (cursorYPt + lineHeightPt > bottomLimitPt) {
          startNewPage();
        }
        const baselineY = cursorYPt + block.fontSizePt;

        if (lineIdx === 0 && block.bulletPrefix) {
          ctx.fillStyle = '#1E293B';
          ctx.font = buildFontString(
            { text: block.bulletPrefix, bold: true, italic: false, underline: false },
            block.fontSizePt
          );
          ctx.fillText(block.bulletPrefix, Math.max(marginPt, startXPt - 15), baselineY);
        }

        for (const run of wrappedLines[lineIdx]) {
          ctx.fillStyle = '#0F172A';
          ctx.font = buildFontString(run.span, block.fontSizePt);
          ctx.fillText(run.text, run.xPt, baselineY);
          if (run.span.underline && run.text.trim().length > 0) {
            ctx.strokeStyle = '#0F172A';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(run.xPt, baselineY + 2);
            ctx.lineTo(run.xPt + run.widthPt, baselineY + 2);
            ctx.stroke();
          }
        }

        cursorYPt += lineHeightPt;
      }

      cursorYPt += block.spaceAfterPt;
    } else if (block.kind === 'table') {
      cursorYPt += 6;
      const colCount = Math.max(1, ...block.rows.map((r) => r.cells.length));
      const colWidthPt = contentWidthPt / colCount;
      const fontSizePt = 9.5;
      const cellPaddingPt = 6;

      for (const row of block.rows) {
        // Wrap each cell's text
        const wrappedCells: string[][] = [];
        let maxLinesInRow = 1;

        for (let c = 0; c < colCount; c++) {
          const cellText = row.cells[c] || '';
          ctx.font = buildFontString(
            { text: cellText, bold: row.isHeader, italic: false, underline: false },
            fontSizePt
          );
          const words = cellText.split(/\s+/).filter(Boolean);
          const cellLines: string[] = [];
          let currentLine = '';
          const availCellW = Math.max(24, colWidthPt - cellPaddingPt * 2);

          for (const w of words) {
            const candidate = currentLine ? `${currentLine} ${w}` : w;
            if (ctx.measureText(candidate).width <= availCellW) {
              currentLine = candidate;
            } else {
              if (currentLine) cellLines.push(currentLine);
              currentLine = w;
            }
          }
          if (currentLine) cellLines.push(currentLine);
          if (cellLines.length === 0) cellLines.push('');
          wrappedCells.push(cellLines);
          maxLinesInRow = Math.max(maxLinesInRow, cellLines.length);
        }

        const rowHeightPt = maxLinesInRow * (fontSizePt * 1.35) + cellPaddingPt * 2;
        if (cursorYPt + rowHeightPt > bottomLimitPt) {
          startNewPage();
        }

        for (let c = 0; c < colCount; c++) {
          const cellX = marginPt + c * colWidthPt;
          if (row.isHeader) {
            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(cellX, cursorYPt, colWidthPt, rowHeightPt);
          }
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 0.75;
          ctx.strokeRect(cellX, cursorYPt, colWidthPt, rowHeightPt);

          ctx.fillStyle = '#0F172A';
          ctx.font = buildFontString(
            { text: '', bold: row.isHeader, italic: false, underline: false },
            fontSizePt
          );
          const cellLines = wrappedCells[c];
          for (let l = 0; l < cellLines.length; l++) {
            ctx.fillText(
              cellLines[l],
              cellX + cellPaddingPt,
              cursorYPt + cellPaddingPt + fontSizePt + l * (fontSizePt * 1.35)
            );
          }
        }

        cursorYPt += rowHeightPt;
      }
      cursorYPt += 10;
    } else if (block.kind === 'image') {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Image load failed'));
          el.src = block.src;
        });
        const natW = img.naturalWidth || 200;
        const natH = img.naturalHeight || 150;
        const maxImgW = contentWidthPt;
        const maxImgH = (bottomLimitPt - marginPt) * 0.65;
        const scale = Math.min(1, maxImgW / natW, maxImgH / natH);
        const drawW = natW * scale;
        const drawH = natH * scale;

        if (cursorYPt + drawH + 8 > bottomLimitPt) {
          startNewPage();
        }
        ctx.drawImage(img, marginPt, cursorYPt + 4, drawW, drawH);
        cursorYPt += drawH + 12;
      } catch {
        // Skip broken embedded image gracefully
      }
    }
  }

  // Add subtle page numbers when multi-page
  if (canvases.length > 1) {
    for (let i = 0; i < canvases.length; i++) {
      const pageCtx = canvases[i].getContext('2d');
      if (pageCtx) {
        pageCtx.fillStyle = '#64748B';
        pageCtx.font = '400 9px "Plus Jakarta Sans", sans-serif';
        const label = `Page ${i + 1} of ${canvases.length}`;
        const textW = pageCtx.measureText(label).width;
        pageCtx.fillText(
          label,
          (pageDims.widthPt - textW) / 2,
          pageDims.heightPt - 24
        );
      }
    }
  }

  onProgress({ percent: 82, message: `Encoding ${canvases.length}-page PDF document...` });
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    const jpgBlob = await new Promise<Blob>((resolve, reject) => {
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode PDF page.'))),
        'image/jpeg',
        0.9
      );
    });
    c.width = 0;
    c.height = 0;

    const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
    const embedded = await pdfDoc.embedJpg(jpgBytes);
    const pdfPage = pdfDoc.addPage([pageDims.widthPt, pageDims.heightPt]);
    pdfPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageDims.widthPt,
      height: pageDims.heightPt,
    });
  }

  // Ensure currentCanvas ref is cleaned up
  void currentCanvas;

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const outName = `${stripExtension(item.name)}.pdf`;

  onProgress({ percent: 100, message: 'Completed!' });

  return {
    toolId: ToolId.WordToPdf,
    toolTitle: 'Word to PDF',
    completedAt: Date.now(),
    summaryText: `Converted "${item.name}" into a ${canvases.length}-page PDF (${formatFileSize(blob.size)})`,
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
