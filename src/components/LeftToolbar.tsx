import { useState, useEffect } from 'react';
import { 
  MousePointer2, MousePointerClick, Hand, SquareDashedMousePointer, Image as ImageIcon, 
  MapPin, Spline, Frame, Ruler, RectangleHorizontal, Circle as CircleIcon, Maximize, Activity, Calculator, PlusCircle,
  Type, MoveUpRight, Cloud, MoveHorizontal
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { calculateTabBOQ } from '../utils/boq';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select Object', hotkey: 'V' },
  { id: 'edit', icon: MousePointerClick, label: 'Edit Vertices', hotkey: 'E' },
  { id: 'pan', icon: Hand, label: 'Pan Canvas', hotkey: 'H' },
  { id: 'polygon', icon: Frame, label: 'Area Polygon', hotkey: 'P' },
  { id: 'rect', icon: RectangleHorizontal, label: 'Area Rectangle', hotkey: 'R' },
  { id: 'circle', icon: CircleIcon, label: 'Area Circle', hotkey: 'O' },
  { id: 'polyline', icon: Spline, label: 'Linear Polyline', hotkey: 'L' },
  { id: 'point', icon: MapPin, label: 'Count Marker', hotkey: 'M' },
  { id: 'deduct', icon: SquareDashedMousePointer, label: 'Deduction Mode', hotkey: 'X' },
  { id: 'text', icon: Type, label: 'Text Label', hotkey: 'T' },
  { id: 'arrow', icon: MoveUpRight, label: 'Leader Arrow', hotkey: 'A' },
  { id: 'cloud', icon: Cloud, label: 'Revision Cloud', hotkey: 'K' },
  { id: 'boundary', icon: Maximize, label: 'Project Boundary', hotkey: 'B' },
  { id: 'warp', icon: ImageIcon, label: 'Perspective Warp', hotkey: 'W' },
  { id: 'scale', icon: Activity, label: 'Set Scale', hotkey: 'C' },
  { id: 'ruler', icon: Ruler, label: 'Measure Ruler', hotkey: 'U' },
  { id: 'dimension', icon: MoveHorizontal, label: 'Dimension Line', hotkey: 'D' },
] as const;

export function LeftToolbar() {
  const { ui, setUI, project, layers: allLayers, materials } = useStore();
  const activeTool = ui.activeTool;
  const activeTab = project.tabs.find(t => t.id === ui.activeTabId) || project.tabs[0];
  const layers = allLayers.filter(l => l.tabId === ui.activeTabId);
  
  const [isResizing, setIsResizing] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', baseRate: 0, type: 'area' as any });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Width is e.clientX because the left toolbar is on the left edge
      const newWidth = e.clientX;
      if (newWidth > 120 && newWidth < 800) {
         setUI({ leftSidebarWidth: newWidth });
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setUI]);

  return (
    <div className="bg-zinc-900 border-r border-zinc-800 flex flex-col select-none z-10 shrink-0 relative h-full" style={{ width: `${ui.leftSidebarWidth}px` }}>
      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/50 z-50 translate-x-1/2" onMouseDown={() => setIsResizing(true)} />
      
      {/* Tools Grid Panel */}
      <div className="p-2 border-b border-zinc-800 flex flex-col">
         <div className="grid grid-cols-2 gap-1.5 justify-items-center">
           {TOOLS.map((tool) => {
             const Icon = tool.icon;
             const isActive = activeTool === tool.id;
             return (
               <button
                 key={tool.id}
                 onClick={() => setUI({ activeTool: tool.id as any })}
                 title={`${tool.label} (${tool.hotkey})`}
                 className={cn(
                   "w-full h-10 rounded flex items-center justify-center transition-colors relative group",
                   isActive 
                     ? "bg-zinc-800 text-amber-400" 
                     : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                 )}
               >
                 <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                 
                 {/* Tooltip */}
                 <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-800 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                   {tool.label} <span className="text-zinc-500 ml-1">{tool.hotkey}</span>
                 </div>
               </button>
             );
           })}
         </div>
      </div>

      {/* Live Estimation Panel (Moved from RightSidebar) */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="px-4 py-3 bg-zinc-850 flex items-center space-x-2 text-zinc-300 font-medium border-b border-zinc-800 sticky top-0 z-10">
          <Calculator size={16} />
          <span>Live Estimation</span>
        </div>
        <div className="p-3 flex-1 overflow-y-auto text-zinc-400">
          {(() => {
            const { lineItems } = calculateTabBOQ(activeTab, allLayers, materials, project.exchangeRate || 1);

            // Group by category
            const byCategory = new Map<string, typeof lineItems>();
            lineItems.forEach(li => {
              if (!byCategory.has(li.category)) byCategory.set(li.category, []);
              byCategory.get(li.category)!.push(li);
            });

            if (lineItems.length === 0) return (
              <div className="text-center py-4 text-xs text-zinc-600">Assign materials to visible layers to see BOQ.</div>
            );

            return Array.from(byCategory.entries()).sort().map(([catName, items]) => (
              <div key={catName} className="mb-5 last:mb-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-800 pb-1">{catName}</div>
                {items.map(li => (
                  <div key={`${li.materialId}-${li.optionName}`} className="mb-2 border border-zinc-800 rounded p-2 bg-zinc-850/50 text-[11px]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold truncate mr-2" style={{ color: li.materialColor }}>
                        {li.materialName} {li.optionName !== 'Standard' ? <span className="text-zinc-500 font-normal">({li.optionName})</span> : ''}
                      </span>
                      <span className="text-amber-400 font-mono">{project.currency}{li.cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>{li.qty.toFixed(2)} {li.unit} @ {project.currency}{li.rate.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ));
          })()}

          <div className="mt-4 pt-4 border-t border-zinc-800/50 pb-4">
            {showCustomForm ? (
              <div className="bg-zinc-800 p-3 rounded space-y-3">
                <input 
                  type="text" placeholder="Item Name" 
                  value={customForm.name} onChange={e => setCustomForm({...customForm, name: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-amber-500" 
                />
                <div className="flex space-x-2">
                  <select 
                    value={customForm.type} onChange={e => setCustomForm({...customForm, type: e.target.value as any})}
                    className="w-1/2 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="area">Area (m²)</option>
                    <option value="linear">Linear (m)</option>
                    <option value="count">Count (ea)</option>
                  </select>
                  <input 
                    type="number" placeholder="Price" min="0" step="any"
                    value={customForm.baseRate || ''} onChange={e => setCustomForm({...customForm, baseRate: parseFloat(e.target.value) || 0})}
                    className="w-1/2 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-amber-500" 
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button onClick={() => setShowCustomForm(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                  <button 
                    onClick={() => {
                      if (!customForm.name) return;
                      useStore.getState().addCustomMaterial({ ...customForm, color: '#f59e0b', category: 'Custom Items' });
                      setShowCustomForm(false);
                      setCustomForm({ name: '', baseRate: 0, type: 'area' });
                    }} 
                    className="text-xs bg-amber-500 text-black px-3 py-1 rounded font-bold hover:bg-amber-400"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowCustomForm(true)} 
                className="w-full py-2 flex items-center justify-center space-x-1 text-xs font-medium text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
              >
                <PlusCircle size={14} />
                <span>Custom Item</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
