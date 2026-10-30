import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { ToolId } from '../types/pdfTools';

async function createSamplePdfFile(filename: string, pageCount: number, accentVariant = 0): Promise<File> {
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]);
    const headerColor = accentVariant === 1 ? rgb(0.09, 0.36, 0.72) : rgb(0.11, 0.31, 0.85);

    page.drawRectangle({
      x: 48,
      y: 745,
      width: 499,
      height: 46,
      color: headerColor,
    });

    page.drawText(`QuickPDF Sample Document — Section ${i}`, {
      x: 64,
      y: 762,
      size: 15,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    page.drawText(`Quarterly Operations & Financial Brief (Page ${i} of ${pageCount})`, {
      x: 48,
      y: 705,
      size: 13,
      font: boldFont,
      color: rgb(0.08, 0.12, 0.2),
    });

    const paragraphs = [
      `This multi-page sample PDF was generated directly inside your browser so you can test Word, Excel, JPG, PNG, Split, Merge, and Compress tools without leaving your device.`,
      `All QuickPDF utilities run locally using HTML5 Canvas and open-source document engines. Private contracts, invoices, spreadsheets, and ID scans never upload to an external server.`,
    ];

    let cursorY = 670;
    for (const para of paragraphs) {
      page.drawText(para, {
        x: 48,
        y: cursorY,
        size: 10.5,
        font: bodyFont,
        color: rgb(0.2, 0.25, 0.33),
        maxWidth: 495,
        lineHeight: 16,
      });
      cursorY -= 58;
    }

    // Draw an aligned financial table on every page so PDF-to-Excel & PDF-to-Word both extract rich data
    const tableTopY = 525;
    const colX = [48, 210, 340, 455];
    const headers = ['Department', 'Q1 Budget', 'Q2 Actual', 'Variance'];
    const rows = [
      ['Product Engineering', '128,400', '124,950', '-2.7%'],
      ['Mobile Platform UX', '64,200', '63,800', '-0.6%'],
      ['Document Core R&D', '92,000', '95,400', '+3.7%'],
      ['Quality Assurance', '41,500', '40,120', '-3.3%'],
    ];

    page.drawRectangle({
      x: 48,
      y: tableTopY - 6,
      width: 499,
      height: 24,
      color: rgb(0.93, 0.96, 1),
    });

    headers.forEach((h, cIdx) => {
      page.drawText(h, {
        x: colX[cIdx] + 6,
        y: tableTopY,
        size: 10,
        font: boldFont,
        color: rgb(0.11, 0.31, 0.85),
      });
    });

    rows.forEach((r, rIdx) => {
      const rowY = tableTopY - 26 * (rIdx + 1);
      r.forEach((cellVal, cIdx) => {
        page.drawText(cellVal, {
          x: colX[cIdx] + 6,
          y: rowY,
          size: 10,
          font: bodyFont,
          color: rgb(0.15, 0.2, 0.28),
        });
      });
    });
  }

  const bytes = await doc.save();
  return new File([bytes as BlobPart], filename, { type: 'application/pdf' });
}

async function createSampleImageFile(index: number, title: string, accentHex: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = accentHex;
  ctx.fillRect(80, 80, 1040, 160);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`0${index}. ${title}`, 120, 178);

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.fillRect(80, 290, 1040, 520);
  ctx.strokeRect(80, 290, 1040, 520);

  ctx.fillStyle = '#0F172A';
  ctx.font = '600 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Local Browser Image-to-PDF Sample Slide', 130, 380);

  ctx.fillStyle = '#475569';
  ctx.font = '400 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('• High-resolution 1200×900 px PNG canvas frame', 130, 455);
  ctx.fillText('• Supports A4, US Letter, or Fit-to-Image page bounds', 130, 510);
  ctx.fillText('• Reorderable before generating your final PDF file', 130, 565);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed sample PNG'))), 'image/png');
  });
  canvas.width = 0;
  canvas.height = 0;

  return new File([blob], `sample-slide-0${index}.png`, { type: 'image/png' });
}

async function createSampleWordFile(): Promise<File> {
  const doc = new Document({
    creator: 'QuickPDF',
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'Project Proposal — QuickPDF Document Suite', bold: true })],
          }),
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: 'This sample Microsoft Word (.docx) document demonstrates local browser conversion from Word to PDF, preserving headings, bold/italic formatting, bulleted lists, and structured tables.',
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '1. Key Capabilities', bold: true })],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: '100% client-side execution with zero server file uploads.' })],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: 'Full Unicode typography support across mobile and desktop screens.' })],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: 'Automatic pagination for A4 and US Letter print layouts.' })],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 220, after: 120 },
            children: [new TextRun({ text: '2. Deliverable Schedule', bold: true })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Milestone', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Owner', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Core PDF & Office Engine')] }),
                  new TableCell({ children: [new Paragraph('Document Team')] }),
                  new TableCell({ children: [new Paragraph('Completed')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Android Responsive UI')] }),
                  new TableCell({ children: [new Paragraph('Mobile UX')] }),
                  new TableCell({ children: [new Paragraph('Verified')] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new File([blob], 'sample-proposal.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function createSampleExcelFile(): Promise<File> {
  const wb = XLSX.utils.book_new();
  const revenueSheet = XLSX.utils.aoa_to_sheet([
    ['Region', 'Product Line', 'Q1 Units', 'Q2 Units', 'Unit Price ($)', 'Total Revenue ($)'],
    ['North America', 'QuickPDF Enterprise', 420, 515, 49.0, '45,815.00'],
    ['Europe', 'QuickPDF Mobile Suite', 680, 790, 29.0, '42,630.00'],
    ['Asia-Pacific', 'Document Workflow SDK', 510, 640, 39.0, '44,850.00'],
    ['Latin America', 'QuickPDF Mobile Suite', 290, 360, 29.0, '18,850.00'],
  ]);
  XLSX.utils.book_append_sheet(wb, revenueSheet, 'Quarterly Revenue');

  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['Category', 'Owner', 'Monthly Allocation ($)', 'Status'],
    ['Cloud Infrastructure', 'Platform Ops', '3,400.00', 'Approved'],
    ['Mobile QA Devices', 'Android Engineering', '1,850.00', 'Completed'],
    ['Accessibility Audit', 'Design Systems', '2,200.00', 'Verified'],
  ]);
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Operations Budget');

  const outArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new File([outArray], 'sample-financial-summary.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function generateSampleFilesForTool(toolId: ToolId): Promise<File[]> {
  switch (toolId) {
    case ToolId.ImageToPdf: {
      const img1 = await createSampleImageFile(1, 'Architecture Overview', '#1D4ED8');
      const img2 = await createSampleImageFile(2, 'Mobile Ergonomics Spec', '#0369A1');
      return [img1, img2];
    }
    case ToolId.MergePdf: {
      const pdfA = await createSamplePdfFile('part-1-executive-summary.pdf', 2, 0);
      const pdfB = await createSamplePdfFile('part-2-financial-appendix.pdf', 2, 1);
      return [pdfA, pdfB];
    }
    case ToolId.WordToPdf: {
      const docx = await createSampleWordFile();
      return [docx];
    }
    case ToolId.ExcelToPdf: {
      const xlsx = await createSampleExcelFile();
      return [xlsx];
    }
    case ToolId.PdfToWord:
    case ToolId.PdfToExcel:
    case ToolId.PdfToJpg:
    case ToolId.PdfToImages:
    case ToolId.SplitPdf:
    case ToolId.CompressPdf: {
      const pdf = await createSamplePdfFile('quarterly-report-3pages.pdf', 3, 0);
      return [pdf];
    }
  }
}
