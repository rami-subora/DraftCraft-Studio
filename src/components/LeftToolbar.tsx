import { 
  MousePointer2, Hand, SquareDashedMousePointer, Image as ImageIcon, 
  MapPin, Spline, Frame, Ruler, RectangleHorizontal, Circle as CircleIcon, Maximize, Activity
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select / Transform', hotkey: 'V' },
  { id: 'pan', icon: Hand, label: 'Pan / Hand Tool', hotkey: 'H / Space' },
  { id: 'polygon', icon: Frame, label: 'Area Polygon', hotkey: 'P' },
  { id: 'rect', icon: RectangleHorizontal, label: 'Area Rectangle', hotkey: 'R' },
  { id: 'circle', icon: CircleIcon, label: 'Area Circle', hotkey: 'O' },
  { id: 'polyline', icon: Spline, label: 'Linear Polyline', hotkey: 'L' },
  { id: 'point', icon: MapPin, label: 'Count Marker', hotkey: 'M' },
  { id: 'deduct', icon: SquareDashedMousePointer, label: 'Deduction Mode', hotkey: 'X' },
  { id: 'boundary', icon: Maximize, label: 'Project Boundary', hotkey: 'B' },
  { id: 'warp', icon: ImageIcon, label: 'Perspective Warp', hotkey: 'W' },
  { id: 'scale', icon: Activity, label: 'Set Scale', hotkey: 'C' },
  { id: 'ruler', icon: Ruler, label: 'Ruler', hotkey: 'U' },
] as const;

export function LeftToolbar() {
  const { ui, setUI } = useStore();
  const activeTool = ui.activeTool;

  // Global hotkeys can be implemented in a separate hook, but we show them here
  return (
    <div className="w-14 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-4 space-y-2 select-none z-10">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        
        return (
          <button
            key={tool.id}
            onClick={() => setUI({ activeTool: tool.id as any })}
            title={`${tool.label} (${tool.hotkey})`}
            className={cn(
              "w-10 h-10 rounded flex items-center justify-center transition-colors relative group",
              isActive 
                ? "bg-zinc-800 text-amber-400" 
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
            )}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            
            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
              {tool.label} <span className="text-zinc-500 ml-1">{tool.hotkey}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
