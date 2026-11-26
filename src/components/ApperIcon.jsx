import { memo } from 'react';
// Named imports keep the startup bundle small: `import * as Icons` pulled in every Lucide icon (~1 MB).
// Add new icon names to both lists below; an unlisted name renders nothing (and warns in dev).
import {
  ArrowLeft, BoxSelect, Camera, Check, ChevronDown, ChevronRight, CircleCheck, ClipboardList, Copy, Download,
  DraftingCompass, Eraser, ExternalLink, EyeOff, FileCode2, FileDown, FileSearch, FileText, Focus, FolderInput,
  FolderX, Hash, ImageOff, ImagePlus, Info, Keyboard, Layers, Layers3, Loader, Loader2, MapPin, Maximize,
  Maximize2, MessageSquareText, Minimize2, MousePointer2, MoveHorizontal, MoveVertical, PanelLeftOpen,
  PanelRightClose, PenLine, PenTool, Plus, Printer, RectangleHorizontal, RefreshCw, RotateCcw, RotateCw, Route,
  Ruler, Save, Scissors, Search, Send, ShieldCheck, Sparkles, Square, Tag, Trash2, TriangleAlert, Type, Undo2,
  Unlink, Upload, UserRound, Wand2, WifiOff, X, ZoomIn, ZoomOut,
} from 'lucide-react';

const KNOWN = {
  ArrowLeft, BoxSelect, Camera, Check, ChevronDown, ChevronRight, CircleCheck, ClipboardList, Copy, Download,
  DraftingCompass, Eraser, ExternalLink, EyeOff, FileCode2, FileDown, FileSearch, FileText, Focus, FolderInput,
  FolderX, Hash, ImageOff, ImagePlus, Info, Keyboard, Layers, Layers3, Loader, Loader2, MapPin, Maximize,
  Maximize2, MessageSquareText, Minimize2, MousePointer2, MoveHorizontal, MoveVertical, PanelLeftOpen,
  PanelRightClose, PenLine, PenTool, Plus, Printer, RectangleHorizontal, RefreshCw, RotateCcw, RotateCw, Route,
  Ruler, Save, Scissors, Search, Send, ShieldCheck, Sparkles, Square, Tag, Trash2, TriangleAlert, Type, Undo2,
  Unlink, Upload, UserRound, Wand2, WifiOff, X, ZoomIn, ZoomOut,
};

const toPascal = (s) => (typeof s === 'string' ? s : '')
  .split('-')
  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  .join('');

function ApperIcon({ name, size = 20, className = '', ...props }) {
  if (!name) return null;
  const Icon = KNOWN[toPascal(name)];
  if (!Icon) {
    if (import.meta.env.DEV) console.warn(`ApperIcon: "${name}" is not in the icon list`);
    return null;
  }
  return <Icon size={size} className={className} {...props} />;
}
export default memo(ApperIcon);
