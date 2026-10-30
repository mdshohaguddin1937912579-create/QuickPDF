# QuickPDF

A responsive, privacy-first PDF, Word, Excel, and Image utility web application built with React 19, TypeScript, Vite, and Tailwind CSS. All conversions run locally in the browser with zero server uploads.

## Included Tools
1. **PDF to Word (DOCX)** — Extracts headings, paragraphs, and layout (with automatic image fallback for scanned pages).
2. **PDF to Excel (XLSX)** — Reconstructs rows and columns into downloadable Excel spreadsheets.
3. **PDF to JPG** — Renders PDF pages into crisp JPEG images (single JPG or ZIP archive).
4. **PDF to PNG** — Renders lossless PNG images from PDF pages at selectable DPI.
5. **Word to PDF** — Converts `.docx` documents into paginated A4 or US Letter PDFs.
6. **Excel to PDF** — Renders `.xlsx`, `.xls`, and `.csv` workbooks into Landscape or Portrait PDF tables.
7. **Image to PDF** — Combines JPG, PNG, WebP, GIF, and BMP images into a single PDF with EXIF orientation normalization.
8. **Merge PDF** — Joins multiple PDF files in custom order.
9. **Split PDF** — Extracts custom page ranges or splits every page into individual PDFs.
10. **Compress PDF** — Optimizes PDF file size locally with configurable compression presets.
11. **User Profile** — Upload, change, and remove a persistent header profile picture and customize profile preferences (`localStorage`).

## Local Setup & Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (port 3000):
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
4. Type-check:
   ```bash
   npm run lint
   ```

## Optional Native Android AdMob Integration

Ad integration is isolated inside `src/ads/` (`admobTypes.ts`, `admobService.ts`, `AdBannerSlot.tsx`). No fake ads or ad-view walls are shown on web. When wrapped inside an Android WebView app, register a `JavascriptInterface` named `AndroidAdMob` and configure `.env` based on `.env.example`.
