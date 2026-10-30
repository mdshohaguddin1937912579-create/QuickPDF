import {
  Camera,
  FileDown,
  FileImage,
  FileOutput,
  Files,
  FileSpreadsheet,
  FileText,
  Images,
  Minimize2,
  Scissors,
  Table2,
} from 'lucide-react';
import { ToolId } from '../types/pdfTools';

interface ToolIconProps {
  toolId: ToolId;
  className?: string;
}

export function ToolIcon({ toolId, className = 'w-5 h-5' }: ToolIconProps) {
  switch (toolId) {
    case ToolId.PdfToWord:
      return <FileOutput className={className} aria-hidden="true" />;
    case ToolId.PdfToExcel:
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case ToolId.PdfToJpg:
      return <Camera className={className} aria-hidden="true" />;
    case ToolId.PdfToImages:
      return <FileImage className={className} aria-hidden="true" />;
    case ToolId.WordToPdf:
      return <FileText className={className} aria-hidden="true" />;
    case ToolId.ExcelToPdf:
      return <Table2 className={className} aria-hidden="true" />;
    case ToolId.ImageToPdf:
      return <Images className={className} aria-hidden="true" />;
    case ToolId.MergePdf:
      return <Files className={className} aria-hidden="true" />;
    case ToolId.SplitPdf:
      return <Scissors className={className} aria-hidden="true" />;
    case ToolId.CompressPdf:
      return <Minimize2 className={className} aria-hidden="true" />;
    default:
      return <FileDown className={className} aria-hidden="true" />;
  }
}
