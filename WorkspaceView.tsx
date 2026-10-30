import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  FilePlus2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { AdBannerSlot } from '../ads/AdBannerSlot';
import { AdPlacement } from '../ads/admobTypes';
import {
  CompressionLevel,
  ExcelSheetMode,
  ImageRenderDpi,
  JpgQualityPreset,
  OutputArtifact,
  PageOrientation,
  PageSizePreset,
  ProcessingResult,
  ProgressState,
  SelectedFileItem,
  SplitMode,
  ToolDefinition,
  ToolId,
  ToolOptionsState,
} from '../types/pdfTools';
import { createId, formatFileSize } from '../utils/formatters';
import { DownloadActionButtons } from './DownloadActionButtons';
import { ToolIcon } from './ToolIcon';

interface WorkspaceViewProps {
  tool: ToolDefinition;
  defaultPageSize?: PageSizePreset.A4 | PageSizePreset.Letter;
  onBack: () => void;
  onResultCompleted: (result: ProcessingResult) => void;
}

const DEFAULT_OPTIONS: ToolOptionsState = {
  pageSize: PageSizePreset.A4,
  orientation: PageOrientation.Auto,
  marginPt: 24,
  splitMode: SplitMode.ExtractSinglePdf,
  pageRangeInput: '1-2',
  renderDpi: ImageRenderDpi.Standard150,
  jpgQuality: JpgQualityPreset.Standard,
  excelSheetMode: ExcelSheetMode.PerPageSheets,
  compressionLevel: CompressionLevel.Balanced,
  wordPageSize: PageSizePreset.A4,
  excelOrientation: PageOrientation.Landscape,
};

export function WorkspaceView({
  tool,
  defaultPageSize = PageSizePreset.A4,
  onBack,
  onResultCompleted,
}: WorkspaceViewProps) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [options, setOptions] = useState<ToolOptionsState>(() => ({
    ...DEFAULT_OPTIONS,
    pageSize: defaultPageSize,
    wordPageSize: defaultPageSize,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedFilesRef = useRef<SelectedFileItem[]>([]);
  selectedFilesRef.current = selectedFiles;

  useEffect(() => {
    setSelectedFiles((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setOptions({
      ...DEFAULT_OPTIONS,
      pageSize: defaultPageSize,
      wordPageSize: defaultPageSize,
    });
    setErrorMessage(null);
    setProgress(null);
    setResult(null);
  }, [tool.id, defaultPageSize]);

  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const validateFileForTool = (file: File): string | null => {
    const lower = file.name.toLowerCase();
    if (file.size === 0) {
      return `"${file.name}" is empty (0 bytes).`;
    }
    if (tool.id === ToolId.ImageToPdf) {
      const validImg =
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|webp|bmp|gif)$/i.test(lower);
      if (!validImg) {
        return `"${file.name}" is not a supported image file. Please select JPG, PNG, WebP, or BMP images.`;
      }
      return null;
    }
    if (tool.id === ToolId.WordToPdf) {
      if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
        return `"${file.name}" uses the legacy Word 97-2003 (.doc) format. Please save it as .docx first.`;
      }
      const validWord =
        lower.endsWith('.docx') ||
        lower.endsWith('.txt') ||
        file.type ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'text/plain';
      if (!validWord) {
        return `"${file.name}" is not a Word (.docx) or plain text (.txt) file.`;
      }
      return null;
    }
    if (tool.id === ToolId.ExcelToPdf) {
      const validExcel =
        /\.(xlsx|xls|csv|ods)$/i.test(lower) ||
        file.type.includes('spreadsheet') ||
        file.type.includes('excel') ||
        file.type === 'text/csv';
      if (!validExcel) {
        return `"${file.name}" is not a supported spreadsheet. Please select an Excel (.xlsx, .xls) or CSV (.csv) file.`;
      }
      return null;
    }

    // All PDF source tools
    const validPdf =
      file.type === 'application/pdf' || lower.endsWith('.pdf');
    if (!validPdf) {
      return `"${file.name}" is not a PDF file. Please select a valid .pdf document.`;
    }
    return null;
  };

  const ingestFiles = async (incomingList: File[]) => {
    if (incomingList.length === 0) return;
    setErrorMessage(null);
    setResult(null);

    const filesToProcess = tool.multiple ? incomingList : [incomingList[0]];
    const builtItems: SelectedFileItem[] = [];

    for (const file of filesToProcess) {
      const validationErr = validateFileForTool(file);
      if (validationErr) {
        setErrorMessage(validationErr);
        return;
      }

      const isImage = file.type.startsWith('image/');
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

      let pageCount: number | undefined;
      if (isPdf) {
        try {
          const { inspectPdfPageCount } = await import('../services/pdfjsClient');
          pageCount = await inspectPdfPageCount(file);
        } catch {
          pageCount = undefined;
        }
      }

      builtItems.push({
        id: createId(),
        file,
        name: file.name,
        sizeBytes: file.size,
        previewUrl,
        pageCount,
      });
    }

    if (tool.id === ToolId.SplitPdf && builtItems[0]?.pageCount) {
      const pages = builtItems[0].pageCount;
      setOptions((prev) => ({
        ...prev,
        pageRangeInput: pages > 1 ? `1-${Math.min(2, pages)}` : '1',
      }));
    }

    setSelectedFiles((prev) => {
      if (!tool.multiple) {
        prev.forEach((old) => {
          if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
        });
        return builtItems;
      }
      return [...prev, ...builtItems];
    });
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    await ingestFiles(list);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const list = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    await ingestFiles(list);
  };

  const handleLoadSample = async () => {
    setIsLoadingSample(true);
    setErrorMessage(null);
    try {
      const { generateSampleFilesForTool } = await import(
        '../services/sampleFiles'
      );
      const sampleFiles = await generateSampleFilesForTool(tool.id);
      await ingestFiles(sampleFiles);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to create sample file.'
      );
    } finally {
      setIsLoadingSample(false);
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setSelectedFiles((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
    setResult(null);
  };

  const removeItem = (id: string) => {
    setSelectedFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
    setResult(null);
  };

  const clearAllFiles = () => {
    selectedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setSelectedFiles([]);
    setResult(null);
    setErrorMessage(null);
    setProgress(null);
  };

  const runToolProcessing = async () => {
    if (selectedFiles.length < tool.minFiles) {
      setErrorMessage(
        tool.minFiles === 2
          ? 'Please select at least 2 PDF files to merge.'
          : 'Please select a file before starting.'
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setResult(null);
    setProgress({ percent: 2, message: 'Loading conversion engine...' });

    try {
      let processed: ProcessingResult;
      switch (tool.id) {
        case ToolId.ImageToPdf: {
          const { processImageToPdf } = await import('../services/pdfEngine');
          processed = await processImageToPdf(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.MergePdf: {
          const { processMergePdf } = await import('../services/pdfEngine');
          processed = await processMergePdf(selectedFiles, setProgress);
          break;
        }
        case ToolId.SplitPdf: {
          const { processSplitPdf } = await import('../services/pdfEngine');
          processed = await processSplitPdf(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.PdfToImages: {
          const { processPdfToImages } = await import('../services/pdfEngine');
          processed = await processPdfToImages(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.PdfToJpg: {
          const { processPdfToJpg } = await import('../services/pdfEngine');
          processed = await processPdfToJpg(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.CompressPdf: {
          const { processCompressPdf } = await import('../services/pdfEngine');
          processed = await processCompressPdf(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.PdfToWord: {
          const { processPdfToWord } = await import('../services/wordEngine');
          processed = await processPdfToWord(selectedFiles, setProgress);
          break;
        }
        case ToolId.WordToPdf: {
          const { processWordToPdf } = await import('../services/wordEngine');
          processed = await processWordToPdf(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.PdfToExcel: {
          const { processPdfToExcel } = await import('../services/excelEngine');
          processed = await processPdfToExcel(selectedFiles, options, setProgress);
          break;
        }
        case ToolId.ExcelToPdf: {
          const { processExcelToPdf } = await import('../services/excelEngine');
          processed = await processExcelToPdf(selectedFiles, options, setProgress);
          break;
        }
      }

      setResult(processed);
      onResultCompleted(processed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while processing your file.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const totalInputBytes = selectedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const primaryArchive: OutputArtifact | undefined = result?.artifacts.find(
    (a) => a.isPrimaryArchive
  );
  const directArtifacts: OutputArtifact[] = result
    ? result.artifacts.filter((a) => !a.isPrimaryArchive)
    : [];
  const isImageExportTool =
    tool.id === ToolId.PdfToImages || tool.id === ToolId.PdfToJpg;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Top Breadcrumb / Back Navigation */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[44px] px-3 -ml-3 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          All PDF Tools
        </button>

        <div className="text-xs text-slate-500 text-right hidden sm:block">
          <span>Processed locally in browser</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>No server upload</span>
        </div>
      </div>

      {/* Main Single-Elevation Workspace Surface */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Tool Header */}
        <div className="p-5 sm:p-7 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ToolIcon toolId={tool.id} className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {tool.title}
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                {tool.description}
              </p>
            </div>
          </div>

          {selectedFiles.length === 0 && (
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoadingSample || isProcessing}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap shrink-0 self-start sm:self-center disabled:opacity-50"
            >
              {isLoadingSample ? 'Generating sample...' : 'Load sample file'}
            </button>
          )}
        </div>

        {/* Hidden Native Device File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={tool.acceptMime}
          multiple={tool.multiple}
          onChange={handleFileInputChange}
          className="sr-only"
          aria-label={`Select files for ${tool.title}`}
        />

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mx-5 sm:mx-7 mt-5 p-4 rounded-xl border border-red-200 bg-red-50/80 flex items-start gap-3 text-red-800"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm leading-relaxed">
              <span className="font-semibold">Processing issue: </span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* File Picker Dropzone */}
        {selectedFiles.length === 0 ? (
          <div className="p-5 sm:p-8">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-blue-50/30'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
                <Upload className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="text-base sm:text-lg font-semibold text-slate-900 mb-1">
                Tap to select {tool.multiple ? 'files' : 'a file'} from your device
              </p>
              <p className="text-sm text-slate-600 mb-6">
                Or drag and drop here <span aria-hidden="true">·</span> Accepted: {tool.acceptLabel}
              </p>
              <span className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap">
                Choose {tool.multiple ? 'Files' : 'File'}
              </span>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {/* Selected Files List Section */}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="text-sm text-slate-700 font-medium">
                  <span className="font-semibold text-slate-900">
                    {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
                  </span>
                  <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {formatFileSize(totalInputBytes)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {tool.multiple && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                      Add more
                    </button>
                  )}
                  {!tool.multiple && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                      Replace file
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAllFiles}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Clear
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-slate-100 border-t border-b border-slate-100">
                {selectedFiles.map((item, idx) => (
                  <li
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={`Preview of ${item.name}`}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 text-blue-600 flex items-center justify-center font-mono text-xs font-semibold shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {formatFileSize(item.sizeBytes)}
                          {typeof item.pageCount === 'number' && (
                            <>
                              <span className="mx-1.5 font-sans" aria-hidden="true">·</span>
                              <span>
                                {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {tool.multiple && selectedFiles.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0 || isProcessing}
                            aria-label={`Move ${item.name} up`}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                          >
                            <ArrowUp className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === selectedFiles.length - 1 || isProcessing}
                            aria-label={`Move ${item.name} down`}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                          >
                            <ArrowDown className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={isProcessing}
                        aria-label={`Remove ${item.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool-Specific Configuration Controls */}
            {tool.id === ToolId.PdfToExcel && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Excel Workbook Layout
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                  {[
                    {
                      value: ExcelSheetMode.PerPageSheets,
                      title: 'One Worksheet per PDF Page',
                      desc: 'Creates Sheet "Page 1", "Page 2", etc.',
                    },
                    {
                      value: ExcelSheetMode.SingleCombinedSheet,
                      title: 'Combine All Pages into One Sheet',
                      desc: 'Appends all detected rows into a single table',
                    },
                  ].map((preset) => {
                    const active = options.excelSheetMode === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          setOptions((o) => ({
                            ...o,
                            excelSheetMode: preset.value,
                          }))
                        }
                        className={`text-left p-3.5 rounded-xl border min-h-[44px] transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50/80 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold">{preset.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{preset.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isImageExportTool && (
              <div className="p-5 sm:p-7 bg-slate-50/60 space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">
                    {tool.id === ToolId.PdfToJpg ? 'JPG' : 'PNG'} Image Resolution
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        value: ImageRenderDpi.Standard150,
                        title: 'Standard (150 DPI)',
                        desc: 'Fast export, compact image size',
                      },
                      {
                        value: ImageRenderDpi.High220,
                        title: 'High (220 DPI)',
                        desc: 'Sharp text & presentation quality',
                      },
                      {
                        value: ImageRenderDpi.Ultra300,
                        title: 'Print (300 DPI)',
                        desc: 'Maximum detail for archival scans',
                      },
                    ].map((preset) => {
                      const active = options.renderDpi === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() =>
                            setOptions((o) => ({ ...o, renderDpi: preset.value }))
                          }
                          className={`text-left p-3.5 rounded-xl border min-h-[44px] transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50/80 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-sm font-semibold">{preset.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{preset.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {tool.id === ToolId.PdfToJpg && (
                  <div className="max-w-xs">
                    <label
                      htmlFor="jpg-quality"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      JPG Compression Quality
                    </label>
                    <select
                      id="jpg-quality"
                      value={options.jpgQuality}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          jpgQuality: e.target.value as JpgQualityPreset,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={JpgQualityPreset.Standard}>
                        Standard Quality (Smaller File)
                      </option>
                      <option value={JpgQualityPreset.High}>
                        High Quality (92% Maximum Clarity)
                      </option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {tool.id === ToolId.WordToPdf && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <div className="max-w-xs">
                  <label
                    htmlFor="word-page-size"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Target PDF Page Format
                  </label>
                  <select
                    id="word-page-size"
                    value={options.wordPageSize}
                    onChange={(e) =>
                      setOptions((o) => ({
                        ...o,
                        wordPageSize: e.target.value as
                          | PageSizePreset.A4
                          | PageSizePreset.Letter,
                      }))
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value={PageSizePreset.A4}>A4 (210 × 297 mm)</option>
                    <option value={PageSizePreset.Letter}>US Letter (8.5 × 11 in)</option>
                  </select>
                </div>
              </div>
            )}

            {tool.id === ToolId.ExcelToPdf && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  Spreadsheet PDF Page Setup
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                  <div>
                    <label
                      htmlFor="excel-page-size"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Page Size
                    </label>
                    <select
                      id="excel-page-size"
                      value={options.wordPageSize}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          wordPageSize: e.target.value as
                            | PageSizePreset.A4
                            | PageSizePreset.Letter,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={PageSizePreset.A4}>A4 (210 × 297 mm)</option>
                      <option value={PageSizePreset.Letter}>US Letter (8.5 × 11 in)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="excel-orientation"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Orientation
                    </label>
                    <select
                      id="excel-orientation"
                      value={options.excelOrientation}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          excelOrientation: e.target.value as
                            | PageOrientation.Landscape
                            | PageOrientation.Portrait,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={PageOrientation.Landscape}>
                        Landscape (Recommended for Wide Tables)
                      </option>
                      <option value={PageOrientation.Portrait}>Portrait</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {tool.id === ToolId.ImageToPdf && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  Page Layout Settings
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="img-page-size"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Page Size
                    </label>
                    <select
                      id="img-page-size"
                      value={options.pageSize}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          pageSize: e.target.value as PageSizePreset,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={PageSizePreset.A4}>A4 (210 × 297 mm)</option>
                      <option value={PageSizePreset.Letter}>US Letter (8.5 × 11 in)</option>
                      <option value={PageSizePreset.FitImage}>Fit Exact Image Bounds</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="img-orientation"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Orientation
                    </label>
                    <select
                      id="img-orientation"
                      value={options.orientation}
                      disabled={options.pageSize === PageSizePreset.FitImage}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          orientation: e.target.value as PageOrientation,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                    >
                      <option value={PageOrientation.Auto}>Auto (Match Image)</option>
                      <option value={PageOrientation.Portrait}>Portrait</option>
                      <option value={PageOrientation.Landscape}>Landscape</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="img-margin"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Margin
                    </label>
                    <select
                      id="img-margin"
                      value={options.marginPt}
                      disabled={options.pageSize === PageSizePreset.FitImage}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          marginPt: Number(e.target.value),
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                    >
                      <option value={0}>No Margin (Full Bleed)</option>
                      <option value={24}>Small Margin</option>
                      <option value={44}>Standard Margin</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {tool.id === ToolId.SplitPdf && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  Split Mode & Page Ranges
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="split-mode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Output Mode
                    </label>
                    <select
                      id="split-mode"
                      value={options.splitMode}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          splitMode: e.target.value as SplitMode,
                        }))
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value={SplitMode.ExtractSinglePdf}>
                        Extract selected pages into 1 PDF
                      </option>
                      <option value={SplitMode.SplitSeparateZip}>
                        Split each range into separate PDFs (ZIP)
                      </option>
                      <option value={SplitMode.EveryPageZip}>
                        Burst every single page into separate PDFs (ZIP)
                      </option>
                    </select>
                  </div>

                  {options.splitMode !== SplitMode.EveryPageZip && (
                    <div>
                      <label
                        htmlFor="split-range"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Page Numbers / Ranges
                        {selectedFiles[0]?.pageCount
                          ? ` (1 to ${selectedFiles[0].pageCount})`
                          : ''}
                      </label>
                      <input
                        id="split-range"
                        type="text"
                        value={options.pageRangeInput}
                        onChange={(e) =>
                          setOptions((o) => ({
                            ...o,
                            pageRangeInput: e.target.value,
                          }))
                        }
                        placeholder="e.g. 1-3, 5"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 bg-white font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs text-slate-500">
                          Example: <span className="font-mono">1-3, 5</span>
                        </span>
                        {selectedFiles[0]?.pageCount && selectedFiles[0].pageCount > 1 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setOptions((o) => ({ ...o, pageRangeInput: '1' }))
                              }
                              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-blue-500 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
                            >
                              First page
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const total = selectedFiles[0]?.pageCount || 1;
                                const odds = Array.from(
                                  { length: total },
                                  (_, idx) => idx + 1
                                ).filter((n) => n % 2 === 1);
                                setOptions((o) => ({
                                  ...o,
                                  pageRangeInput: odds.join(', '),
                                }));
                              }}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-blue-500 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
                            >
                              Odd pages
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const total = selectedFiles[0]?.pageCount || 2;
                                const evens = Array.from(
                                  { length: total },
                                  (_, idx) => idx + 1
                                ).filter((n) => n % 2 === 0);
                                if (evens.length > 0) {
                                  setOptions((o) => ({
                                    ...o,
                                    pageRangeInput: evens.join(', '),
                                  }));
                                }
                              }}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-blue-500 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
                            >
                              Even pages
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const total = selectedFiles[0]?.pageCount || 1;
                                setOptions((o) => ({
                                  ...o,
                                  pageRangeInput: `1-${total}`,
                                }));
                              }}
                              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-blue-500 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
                            >
                              All pages
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tool.id === ToolId.CompressPdf && (
              <div className="p-5 sm:p-7 bg-slate-50/60">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Compression Level
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      value: CompressionLevel.Balanced,
                      title: 'Balanced (Recommended)',
                      desc: 'Good quality, strong size reduction',
                    },
                    {
                      value: CompressionLevel.Maximum,
                      title: 'Maximum Compression',
                      desc: 'Smallest file size for email/chat',
                    },
                    {
                      value: CompressionLevel.HighQuality,
                      title: 'High Visual Quality',
                      desc: 'Crisp pages, moderate reduction',
                    },
                  ].map((preset) => {
                    const active = options.compressionLevel === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          setOptions((o) => ({
                            ...o,
                            compressionLevel: preset.value,
                          }))
                        }
                        className={`text-left p-3.5 rounded-xl border min-h-[44px] transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50/80 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold">{preset.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{preset.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Primary Action & Progress Section */}
            <div className="p-5 sm:p-7">
              {isProcessing && progress && (
                <div className="mb-5" aria-live="polite">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span className="truncate pr-3">{progress.message}</span>
                    <span className="font-mono tabular-nums font-semibold text-blue-700 shrink-0">
                      {progress.percent}%
                    </span>
                  </div>
                  <progress
                    value={Math.max(2, progress.percent)}
                    max={100}
                    className="w-full h-2.5 appearance-none rounded-full overflow-hidden bg-slate-100 [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-blue-600 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-blue-600"
                  />
                </div>
              )}

              {!result ? (
                <button
                  type="button"
                  onClick={runToolProcessing}
                  disabled={isProcessing || selectedFiles.length < tool.minFiles}
                  className="w-full sm:w-auto min-w-[220px] min-h-[48px] px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Processing locally...
                    </>
                  ) : (
                    <>
                      <ToolIcon toolId={tool.id} className="w-4 h-4" />
                      {tool.actionLabel}
                    </>
                  )}
                </button>
              ) : (
                /* Completed Result & Working Download Controls */
                <div className="space-y-5">
                  <div className="p-4 sm:p-5 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Ready to download
                        </p>
                        <p className="text-xs sm:text-sm text-slate-700 mt-0.5 font-mono tabular-nums">
                          {result.summaryText}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setResult(null)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Adjust & Re-run
                    </button>
                  </div>

                  {/* Primary Archive Download CTA (when multiple pages/files exported) */}
                  {primaryArchive && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {primaryArchive.filename}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {primaryArchive.subtitle}
                        </p>
                      </div>
                      <DownloadActionButtons
                        artifact={primaryArchive}
                        label="Download All (.ZIP)"
                        variant="primary"
                        isArchive
                      />
                    </div>
                  )}

                  {/* Image Gallery Grid for PDF to PNG and PDF to JPG */}
                  {isImageExportTool ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {directArtifacts.map((art) => (
                        <div
                          key={art.id}
                          className="border border-slate-200 rounded-xl p-3 flex flex-col justify-between bg-slate-50/40"
                        >
                          {art.previewImageUrl && (
                            <div className="aspect-[3/4] bg-white border border-slate-100 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                              <img
                                src={art.previewImageUrl}
                                alt={art.filename}
                                referrerPolicy="no-referrer"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {art.filename}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5 mb-3">
                              {art.subtitle}
                            </p>
                            <DownloadActionButtons
                              artifact={art}
                              label={
                                tool.id === ToolId.PdfToJpg
                                  ? 'Download JPG'
                                  : 'Download PNG'
                              }
                              variant="compact"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {directArtifacts.map((art) => (
                        <li
                          key={art.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {art.filename}
                            </p>
                            {art.subtitle && (
                              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                                {art.subtitle}
                              </p>
                            )}
                          </div>
                          <DownloadActionButtons
                            artifact={art}
                            label={primaryArchive ? 'Download File' : 'Download Now'}
                            variant={primaryArchive ? 'secondary' : 'primary'}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Decoupled Native Android AdMob Slot (renders nothing on web when native SDK is absent) */}
      <div className="mt-6">
        <AdBannerSlot placement={AdPlacement.WorkspaceBottomBanner} />
      </div>
    </div>
  );
}
