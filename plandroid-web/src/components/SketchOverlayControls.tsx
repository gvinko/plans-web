import { useRef } from 'react';

interface SketchOverlayControlsProps {
  hasSketch: boolean;
  opacity: number;
  onUpload: (file: File) => void;
  onOpacityChange: (opacity: number) => void;
}

export default function SketchOverlayControls({ hasSketch, opacity, onUpload, onOpacityChange }: SketchOverlayControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute top-3 right-3 z-10 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-3 text-xs font-mono shadow-lg">
      <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
        {hasSketch ? 'Replace Sketch' : 'Import Sketch'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
      {hasSketch && (
        <label className="flex items-center gap-1">
          Opacity
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
          />
        </label>
      )}
    </div>
  );
}
