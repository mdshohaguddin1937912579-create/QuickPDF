export enum ToolId {
  PdfToWord = 'pdf-to-word',
  PdfToExcel = 'pdf-to-excel',
  PdfToJpg = 'pdf-to-jpg',
  PdfToImages = 'pdf-to-images',
  WordToPdf = 'word-to-pdf',
  ExcelToPdf = 'excel-to-pdf',
  ImageToPdf = 'image-to-pdf',
  MergePdf = 'merge-pdf',
  SplitPdf = 'split-pdf',
  CompressPdf = 'compress-pdf',
}

export enum ToolCategory {
  All = 'all',
  Convert = 'convert',
  Organize = 'organize',
}

export enum PageSizePreset {
  A4 = 'a4',
  Letter = 'letter',
  FitImage = 'fit',
}

export enum PageOrientation {
  Auto = 'auto',
  Portrait = 'portrait',
  Landscape = 'landscape',
}

export enum SplitMode {
  ExtractSinglePdf = 'extract-single',
  SplitSeparateZip = 'split-separate',
  EveryPageZip = 'every-page',
}

export enum CompressionLevel {
  Balanced = 'balanced',
  Maximum = 'maximum',
  HighQuality = 'high-quality',
}

export enum ImageRenderDpi {
  Standard150 = '150',
  High220 = '220',
  Ultra300 = '300',
}

export enum JpgQualityPreset {
  Standard = '0.82',
  High = '0.92',
}

export enum ExcelSheetMode {
  PerPageSheets = 'per-page',
  SingleCombinedSheet = 'combined',
}

export interface ToolDefinition {
  id: ToolId;
  title: string;
  shortTitle: string;
  description: string;
  category: ToolCategory.Convert | ToolCategory.Organize;
  acceptMime: string;
  acceptLabel: string;
  multiple: boolean;
  minFiles: number;
  actionLabel: string;
  outputFormatLabel: string;
}

export interface SelectedFileItem {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  previewUrl?: string;
  pageCount?: number;
}

export interface OutputArtifact {
  id: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  url: string;
  sizeBytes: number;
  previewImageUrl?: string;
  subtitle?: string;
  isPrimaryArchive?: boolean;
}

export interface ProcessingResult {
  toolId: ToolId;
  toolTitle: string;
  completedAt: number;
  summaryText: string;
  originalBytesTotal: number;
  outputBytesTotal: number;
  artifacts: OutputArtifact[];
}

export interface ProgressState {
  percent: number;
  message: string;
}

export interface ToolOptionsState {
  // Image to PDF
  pageSize: PageSizePreset;
  orientation: PageOrientation;
  marginPt: number;
  // Split PDF
  splitMode: SplitMode;
  pageRangeInput: string;
  // PDF to PNG / PDF to JPG
  renderDpi: ImageRenderDpi;
  jpgQuality: JpgQualityPreset;
  // PDF to Excel
  excelSheetMode: ExcelSheetMode;
  // Compress PDF
  compressionLevel: CompressionLevel;
  // Word to PDF & Excel to PDF
  wordPageSize: PageSizePreset.A4 | PageSizePreset.Letter;
  excelOrientation: PageOrientation.Landscape | PageOrientation.Portrait;
}
