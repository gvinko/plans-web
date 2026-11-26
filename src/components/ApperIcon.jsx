import { memo, useEffect, useState } from 'react';
// Named imports keep the startup bundle small: `import * as Icons` pulled in every Lucide icon (~1 MB).
// Add new icon names here. Any name not listed still works — the full set is loaded on demand.
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

let allIcons = null;
let loading = null;
const loadAll = () => (loading ||= import('lucide-react').then((m) => (allIcons = m)));

const toPascal = (s) => (typeof s === 'string' ? s : '')
  .split('-')
  .map(w => w.charAt(0).toUpperCase() + w.slice(1))
  .join('');

function ApperIcon({ name, size = 20, className = '', ...props }) {
  const key = toPascal(name);
  const Icon = KNOWN[key] || allIcons?.[key];
  const [, setLoaded] = useState(false);
  useEffect(() => {
    if (key && !Icon && !allIcons) loadAll().then(() => setLoaded(true));
  }, [key, Icon]);
  if (!name || !Icon) return null;
  return <Icon size={size} className={className} {...props} />;
}
export default memo(ApperIcon);
