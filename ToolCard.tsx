import { ArrowRight } from 'lucide-react';
import { ToolCategory, ToolDefinition } from '../types/pdfTools';
import { ToolIcon } from './ToolIcon';

interface ToolCardProps {
  tool: ToolDefinition;
  onSelect: (tool: ToolDefinition) => void;
}

export function ToolCard({ tool, onSelect }: ToolCardProps) {
  const categoryLabel =
    tool.category === ToolCategory.Convert ? 'Convert' : 'Organize';

  return (
    <button
      type="button"
      onClick={() => onSelect(tool)}
      className="group w-full text-left bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition-colors duration-150 flex flex-col justify-between min-h-[188px]"
    >
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150">
            <ToolIcon toolId={tool.id} className="w-5 h-5" />
          </div>
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
            {categoryLabel} <span aria-hidden="true">·</span> {tool.outputFormatLabel}
          </span>
        </div>

        <h3 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight mb-1.5 group-hover:text-blue-700 transition-colors duration-150">
          {tool.title}
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          {tool.description}
        </p>
      </div>

      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">Input: {tool.acceptLabel}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-blue-600 whitespace-nowrap shrink-0 group-hover:translate-x-0.5 transition-transform duration-150">
          Open tool
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
