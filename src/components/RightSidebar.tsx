import React, { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Layers, Settings2, Calculator, Trash2, Eye, EyeOff } from 'lucide-react';
import { getPolygonArea, getPolylineLength } from '../utils/geometry';
import type { ShapeLayer, Material } from '../store/useStore';

export function RightSidebar() {
  const { layers, materials, ui, setUI, project, updateLayer, deleteLayer, setMaterials } = useStore();
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  const selectedLayers = layers.filter(l => ui.selectedLayerIds.includes(l.id));
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) setWidth(newWidth);
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
  }, [isResizing]);

  // Group layers by material
  const groupedLayers = useMemo(() => {
    const groups: { material: Material | null; layers: ShapeLayer[] }[] = [];
    
    const unassigned = layers.filter(l => !l.materialId && l.type !== 'deduction');
    const deductions = layers.filter(l => l.type === 'deduction');
    
    materials.forEach(mat => {
      const matLayers = layers.filter(l => l.materialId === mat.id && l.type !== 'deduction');
      if (matLayers.length > 0) groups.push({ material: mat, layers: matLayers });
    });

    if (unassigned.length > 0) groups.push({ material: null, layers: unassigned });
    if (deductions.length > 0) groups.push({ material: { id: 'deductions', name: 'Deductions (Subtractions)', color: '#ef4444', type: 'area', baseRate: 0 }, layers: deductions });
    
    return groups;
  }, [layers, materials]);

  const toggleGroupVisibility = (groupLayers: ShapeLayer[]) => {
    const anyHidden = groupLayers.some(l => !l.visible);
    groupLayers.forEach(l => updateLayer(l.id, { visible: anyHidden })); // turn all on if any is off, else turn all off
  };

  const updateMaterialColor = (matId: string, color: string) => {
    setMaterials(materials.map(m => m.id === matId ? { ...m, color } : m));
  };

  return (
    <div className="bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-y-auto select-none z-10 text-sm relative shrink-0" style={{ width: `${width}px` }}>
      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/50 z-50" onMouseDown={() => setIsResizing(true)} />
      
      {/* Layers Panel */}
      <div className="border-b border-zinc-800 flex-1 min-h-[30%] overflow-y-auto">
        <div className="px-4 py-3 bg-zinc-850 flex items-center space-x-2 text-zinc-300 font-medium sticky top-0 z-10 border-b border-zinc-800">
          <Layers size={16} />
          <span>Layers</span>
        </div>
        <div className="p-3 flex flex-col space-y-4 text-zinc-400">
          {layers.length === 0 ? (
            <div className="text-center py-4 text-zinc-600">No layers yet</div>
          ) : (
            groupedLayers.map((group, idx) => (
              <div key={group.material ? group.material.id : `unassigned-${idx}`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex justify-between items-center group-hover:text-zinc-400">
                  <div className="flex items-center space-x-2">
                    {group.material && group.material.id !== 'deductions' ? (
                      <input type="color" value={group.material.color} onChange={(e) => updateMaterialColor(group.material!.id, e.target.value)} className="w-3 h-3 p-0 border-0 rounded-full overflow-hidden cursor-pointer bg-transparent" title="Edit Material Color" />
                    ) : (
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.material?.color || '#52525b' }}></span>
                    )}
                    <span>{group.material ? group.material.name : 'Unassigned'}</span>
                  </div>
                  <button onClick={() => toggleGroupVisibility(group.layers)} className="text-zinc-600 hover:text-zinc-300" title="Toggle Group Visibility">
                    {group.layers.every(l => l.visible) ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
                <div className="space-y-1">
                  {group.layers.map(layer => (
                    <div 
                      key={layer.id} 
                      className={`px-2 py-1.5 rounded border cursor-pointer flex justify-between items-center transition-colors ${ui.selectedLayerIds.includes(layer.id) ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'border-zinc-800/50 hover:border-zinc-700'} ${!layer.visible ? 'opacity-50' : ''}`}
                      onClick={(e) => {
                        if (e.shiftKey) {
                           if (ui.selectedLayerIds.includes(layer.id)) {
                             setUI({ selectedLayerIds: ui.selectedLayerIds.filter(id => id !== layer.id) });
                           } else {
                             setUI({ selectedLayerIds: [...ui.selectedLayerIds, layer.id] });
                           }
                        } else {
                           setUI({ selectedLayerIds: [layer.id] });
                        }
                      }}
                    >
                      <div className="truncate pr-2 flex-1">
                        <div className="font-medium text-zinc-300">{layer.name}</div>
                        <div className="text-[10px] mt-0.5 text-zinc-500 capitalize">{layer.type}</div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button 
                          onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                          className={`p-1 rounded transition-colors ${layer.visible ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-600 hover:text-amber-400'}`}
                          title="Toggle Visibility (Disables BOQ)"
                        >
                          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                          className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                          title="Delete Layer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Properties Panel */}
      <div className="border-b border-zinc-800 shrink-0">
        <div className="px-4 py-3 bg-zinc-850 flex items-center space-x-2 text-zinc-300 font-medium border-b border-zinc-800">
          <Settings2 size={16} />
          <span>Properties</span>
        </div>
        <div className="p-4 text-zinc-400">
          {selectedLayers.length === 0 ? (
            <div className="text-center py-2 text-zinc-600">Select a layer to view properties.</div>
          ) : selectedLayers.length === 1 && selectedLayer ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Name</label>
                <input 
                  type="text" 
                  value={selectedLayer.name}
                  onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {selectedLayer.type !== 'deduction' && selectedLayer.type !== 'boundary' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Material</label>
                  <select 
                    value={selectedLayer.materialId || ''}
                    onChange={(e) => updateLayer(selectedLayer.id, { materialId: e.target.value || null })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500 mb-2"
                  >
                    <option value="">-- No Material --</option>
                    {materials
                      .filter(m => {
                        if (['polygon', 'rect', 'circle'].includes(selectedLayer.type)) return m.type === 'area';
                        if (selectedLayer.type === 'polyline') return m.type === 'linear';
                        if (selectedLayer.type === 'point') return m.type === 'count';
                        return true;
                      })
                      .map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                    }
                  </select>
                  {selectedLayer.materialId && materials.find(m => m.id === selectedLayer.materialId)?.image && (
                    <img 
                      src={materials.find(m => m.id === selectedLayer.materialId)!.image} 
                      alt="Material Reference" 
                      className="w-full h-24 object-cover rounded border border-zinc-700 mt-1" 
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </div>
              )}

              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Opacity Override</label>
                  <input 
                    type="range" min="0" max="1" step="0.05"
                    value={selectedLayer.opacity}
                    onChange={(e) => updateLayer(selectedLayer.id, { opacity: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Color Override</label>
                  <input 
                    type="color" 
                    value={selectedLayer.colorOverride || '#52525b'}
                    onChange={(e) => updateLayer(selectedLayer.id, { colorOverride: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                    title="Override Material Color"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Measurements</div>
                {['polygon', 'deduction', 'boundary', 'rect', 'circle'].includes(selectedLayer.type) ? (
                  <div className="text-zinc-300">{project.scaleRatio ? (getPolygonArea(selectedLayer.points) / Math.pow(project.scaleRatio, 2)).toFixed(2) + ' m²' : 'Uncalibrated'}</div>
                ) : selectedLayer.type === 'polyline' ? (
                  <div className="text-zinc-300">{project.scaleRatio ? (getPolylineLength(selectedLayer.points) / project.scaleRatio).toFixed(2) + ' m' : 'Uncalibrated'}</div>
                ) : (
                  <div className="text-zinc-300">Count: 1</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
               <div className="text-center font-semibold text-amber-500 mb-2">{selectedLayers.length} Layers Selected</div>
               
               <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Assign Material (All)</label>
                  <select 
                    onChange={(e) => {
                      const val = e.target.value || null;
                      selectedLayers.forEach(l => {
                         updateLayer(l.id, { materialId: val });
                      });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- No Material / Keep Current --</option>
                    {materials
                      .filter(m => {
                        return selectedLayers.every(layer => {
                          if (['polygon', 'rect', 'circle'].includes(layer.type)) return m.type === 'area';
                          if (layer.type === 'polyline') return m.type === 'linear';
                          if (layer.type === 'point') return m.type === 'count';
                          return true;
                        });
                      })
                      .map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                    }
                  </select>
               </div>
               
               <div className="flex space-x-4">
                 <div className="flex-1">
                   <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Set Opacity (All)</label>
                   <input 
                     type="range" min="0" max="1" step="0.05"
                     defaultValue="1"
                     onChange={(e) => {
                       const val = parseFloat(e.target.value);
                       selectedLayers.forEach(l => updateLayer(l.id, { opacity: val }));
                     }}
                     className="w-full accent-amber-500"
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Set Color (All)</label>
                   <input 
                     type="color" 
                     onChange={(e) => {
                        const val = e.target.value;
                        selectedLayers.forEach(l => updateLayer(l.id, { colorOverride: val }));
                     }}
                     className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                     title="Override Material Color"
                   />
                 </div>
               </div>
               
               <button 
                 onClick={() => {
                   selectedLayers.forEach(l => deleteLayer(l.id));
                   setUI({ selectedLayerIds: [] });
                 }}
                 className="w-full mt-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 py-1.5 rounded transition-colors font-medium text-xs"
               >
                 Delete Selected Layers
               </button>
            </div>
          )}
        </div>
      </div>

      {/* Estimation Panel */}
      <div className="shrink-0 max-h-64 overflow-y-auto">
        <div className="px-4 py-3 bg-zinc-850 flex items-center space-x-2 text-zinc-300 font-medium border-b border-zinc-800 sticky top-0">
          <Calculator size={16} />
          <span>Live Estimation</span>
        </div>
        <div className="p-4 text-zinc-400">
          {(() => {
            const categories = new Map<string, Material[]>();
            materials.forEach(mat => {
              const cat = mat.category || 'Uncategorized';
              if (!categories.has(cat)) categories.set(cat, []);
              categories.get(cat)!.push(mat);
            });
            
            return Array.from(categories.entries()).sort().map(([catName, catMats]) => {
              const hasVisibleLayers = catMats.some(mat => layers.some(l => l.materialId === mat.id && l.visible));
              if (!hasVisibleLayers) return null;
              
              return (
                <div key={catName} className="mb-5 last:mb-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-800 pb-1">{catName}</div>
                  {catMats.map(mat => {
                    const matLayers = layers.filter(l => l.materialId === mat.id && l.visible);
                    if (matLayers.length === 0) return null;
                    
                    let qty = 0;
                    matLayers.forEach(l => {
                      if (['polygon', 'rect', 'circle'].includes(l.type) && project.scaleRatio) {
                        qty += getPolygonArea(l.points) / Math.pow(project.scaleRatio, 2);
                      } else if (l.type === 'polyline' && project.scaleRatio) {
                        qty += getPolylineLength(l.points) / project.scaleRatio;
                      } else if (l.type === 'point') {
                        qty += 1;
                      }
                    });
                    
                    if (mat.type === 'area' && project.scaleRatio) {
                      layers.filter(l => l.type === 'deduction' && l.visible).forEach(l => {
                         qty -= getPolygonArea(l.points) / Math.pow(project.scaleRatio!, 2);
                      });
                    }

                    if (qty <= 0) return null;

                    const cost = qty * mat.baseRate;
                    const unit = mat.type === 'area' ? 'm²' : mat.type === 'linear' ? 'm' : 'ea';

                    return (
                      <div key={mat.id} className="mb-2 border border-zinc-800 rounded p-2 bg-zinc-850/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-zinc-300" style={{ color: mat.color }}>{mat.name}</span>
                          <span className="text-amber-400 font-mono">${cost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>{qty.toFixed(2)} {unit} @ ${mat.baseRate}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}


          {!layers.some(l => l.materialId && l.visible) && (
            <div className="text-center py-2 text-zinc-600">Assign materials to visible layers to see BOQ.</div>
          )}
        </div>
      </div>
    </div>
  );
}
