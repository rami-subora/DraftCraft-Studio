import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Layers, Settings2, Trash2, Eye, EyeOff, Folder as FolderIcon, FolderOpen, ChevronDown, ChevronRight, FolderPlus, Lock, Unlock, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Copy } from 'lucide-react';
import { getPolygonArea, getPolylineLength } from '../utils/geometry';
import type { ShapeLayer, Material, LayerFolder } from '../store/useStore';

export function RightSidebar() {
  const { layers: allLayers, materials, folders: allFolders, ui, setUI, updateLayer, deleteLayer, addFolder, updateFolder, deleteFolder, setMaterials, duplicateLayers, moveLayersZIndex, project } = useStore();
  const activeTab = project.tabs.find(t => t.id === ui.activeTabId) || project.tabs[0];
  const [isResizing, setIsResizing] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [collapsedMaterials, setCollapsedMaterials] = useState<Record<string, boolean>>({});

  const layers = allLayers.filter(l => l.tabId === ui.activeTabId);
  const folders = allFolders.filter(f => f.tabId === ui.activeTabId);

  const selectedLayers = layers.filter(l => ui.selectedLayerIds.includes(l.id));
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < 800) {
         setUI({ rightSidebarWidth: newWidth });
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
  }, [isResizing]);

  const folderGroups = useMemo(() => {
    const fGroups: { folder: LayerFolder | null; materialGroups: { material: Material | null; layers: ShapeLayer[] }[] }[] = [];
    
    const groupLayersByMaterial = (layersToGroup: ShapeLayer[]) => {
       const mGroups: { material: Material | null; layers: ShapeLayer[] }[] = [];
       const unassigned = layersToGroup.filter(l => !l.materialId && l.type !== 'deduction');
       const deductions = layersToGroup.filter(l => l.type === 'deduction');
       
       materials.forEach(mat => {
         const matLayers = layersToGroup.filter(l => l.materialId === mat.id && l.type !== 'deduction');
         if (matLayers.length > 0) mGroups.push({ material: mat, layers: matLayers });
       });
       
       if (unassigned.length > 0) mGroups.push({ material: null, layers: unassigned });
       if (deductions.length > 0) mGroups.push({ material: { id: 'deductions', name: 'Deductions', color: '#ef4444', type: 'area', baseRate: 0 }, layers: deductions });
       return mGroups;
    };

    folders.forEach(folder => {
       const folderLayers = layers.filter(l => l.folderId === folder.id);
       fGroups.push({ folder, materialGroups: groupLayersByMaterial(folderLayers) });
    });

    const rootLayers = layers.filter(l => !l.folderId);
    if (rootLayers.length > 0 || fGroups.length === 0) {
       fGroups.push({ folder: null, materialGroups: groupLayersByMaterial(rootLayers) });
    }

    return fGroups;
  }, [layers, materials, folders]);

  const toggleGroupVisibility = (groupLayers: ShapeLayer[]) => {
    const anyHidden = groupLayers.some(l => !l.visible);
    groupLayers.forEach(l => updateLayer(l.id, { visible: anyHidden })); // turn all on if any is off, else turn all off
  };

  const updateMaterialColor = (matId: string, color: string) => {
    setMaterials(materials.map(m => m.id === matId ? { ...m, color } : m));
  };

  return (
    <div className="bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-y-auto select-none z-10 text-sm relative shrink-0" style={{ width: `${ui.rightSidebarWidth}px` }}>
      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/50 z-50" onMouseDown={() => setIsResizing(true)} />
      
      {/* Layers Panel */}
      <div className="border-b border-zinc-800 flex-1 min-h-[30%] overflow-y-auto">
        <div className="px-4 py-3 bg-zinc-850 flex justify-between items-center text-zinc-300 font-medium sticky top-0 z-10 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
             <Layers size={16} />
             <span>Layers</span>
          </div>
          <button 
             onClick={() => {
                const id = `folder-${Date.now()}`;
                addFolder({ id, tabId: ui.activeTabId, name: `Folder ${folders.length + 1}`, visible: true, locked: false, color: '#3b82f6' });
             }}
             className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
             title="Create Folder"
          >
             <FolderPlus size={16} />
          </button>
        </div>
        <div className="p-3 flex flex-col space-y-4 text-zinc-400">
          {layers.length === 0 && folders.length === 0 ? (
            <div className="text-center py-4 text-zinc-600">No layers yet</div>
          ) : (
            folderGroups.map((fGroup, fIdx) => {
               const folder = fGroup.folder;
               const isCollapsed = folder ? collapsedFolders[folder.id] : false;
               const allFolderLayers = fGroup.materialGroups.flatMap(mg => mg.layers);
               const isFolderVisible = folder ? folder.visible : true;
               
               return (
                 <div key={folder ? folder.id : `root-${fIdx}`} className="mb-2">
                    {folder && (
                       <div className="flex items-center justify-between mb-1 py-1.5 px-2 bg-zinc-800/40 border border-zinc-800/80 rounded group cursor-pointer hover:bg-zinc-800/60 transition-colors" onClick={() => setCollapsedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }))}>
                         <div className="flex items-center space-x-2">
                            {isCollapsed ? <ChevronRight size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                            {isCollapsed ? <FolderIcon size={14} className="text-amber-500" /> : <FolderOpen size={14} className="text-amber-500" />}
                            <span className="font-semibold text-zinc-300 truncate w-32" style={{ color: folder.color }}>{folder.name}</span>
                         </div>
                         <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); updateFolder(folder.id, { visible: !folder.visible }); allFolderLayers.forEach(l => updateLayer(l.id, { visible: !folder.visible })); }}
                              className="p-1 rounded text-zinc-500 hover:text-zinc-300"
                              title="Toggle Folder Visibility"
                            >
                              {folder.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }} className="p-1 rounded text-zinc-500 hover:text-red-400">
                               <Trash2 size={14} />
                            </button>
                         </div>
                       </div>
                    )}
                    
                    {!isCollapsed && (
                       <div className={folder ? "pl-5 border-l border-zinc-800/50 ml-3 mt-2 space-y-4" : "space-y-4"}>
                          {fGroup.materialGroups.map((group, idx) => {
                            const matKey = group.material ? group.material.id : `unassigned-${idx}`;
                            const isMatCollapsed = collapsedMaterials[`${folder ? folder.id : 'root'}-${matKey}`];
                            return (
                            <div key={matKey}>
                              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex justify-between items-center group-hover:text-zinc-400">
                                <div className="flex items-center space-x-2 cursor-pointer hover:text-zinc-300 transition-colors flex-1" onClick={() => setCollapsedMaterials(prev => ({ ...prev, [`${folder ? folder.id : 'root'}-${matKey}`]: !prev[`${folder ? folder.id : 'root'}-${matKey}`] }))}>
                                  {isMatCollapsed ? <ChevronRight size={14} className="text-zinc-600" /> : <ChevronDown size={14} className="text-zinc-600" />}
                                  {group.material && group.material.id !== 'deductions' ? (
                                    <input type="color" value={group.material.color} onChange={(e) => updateMaterialColor(group.material!.id, e.target.value)} onClick={e => e.stopPropagation()} className="w-3 h-3 p-0 border-0 rounded-full overflow-hidden cursor-pointer bg-transparent" title="Edit Material Color" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.material?.color || '#52525b' }}></span>
                                  )}
                                  <span>{group.material ? group.material.name : 'Unassigned'}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <button 
                                    onClick={(e) => {
                                      const groupIds = group.layers.map(l => l.id);
                                      if (e.shiftKey) {
                                        const newIds = new Set([...ui.selectedLayerIds, ...groupIds]);
                                        setUI({ selectedLayerIds: Array.from(newIds) });
                                      } else {
                                        setUI({ selectedLayerIds: groupIds });
                                      }
                                    }}
                                    className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700 transition-colors mr-1"
                                    title="Select all"
                                  >
                                    Select All
                                  </button>
                                  <button onClick={() => toggleGroupVisibility(group.layers)} className="text-zinc-600 hover:text-zinc-300" title="Toggle Visibility">
                                    {group.layers.every(l => l.visible) ? <Eye size={14} /> : <EyeOff size={14} />}
                                  </button>
                                </div>
                              </div>
                              {!isMatCollapsed && (
                                <div className="space-y-1">
                                  {group.layers.map(layer => (
                                    <div 
                                      key={layer.id} 
                                      className={`px-2 py-1.5 rounded border cursor-pointer flex justify-between items-center transition-colors ${ui.selectedLayerIds.includes(layer.id) ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'border-zinc-800/50 hover:border-zinc-700'} ${(!layer.visible || !isFolderVisible) ? 'opacity-50' : ''}`}
                                      onMouseEnter={() => setUI({ hoveredLayerId: layer.id })}
                                      onMouseLeave={() => setUI({ hoveredLayerId: null })}
                                      onClick={(e) => {
                                        if (e.shiftKey) {
                                           setUI({ selectedLayerIds: ui.selectedLayerIds.includes(layer.id) ? ui.selectedLayerIds.filter(id => id !== layer.id) : [...ui.selectedLayerIds, layer.id] });
                                        } else {
                                           setUI({ selectedLayerIds: [layer.id] });
                                        }
                                      }}
                                    >
                                      <div className="truncate pr-2 flex-1">
                                        <div className="font-medium text-zinc-300 truncate">{layer.name}</div>
                                        <div className="text-[10px] mt-0.5 text-zinc-500 capitalize">{layer.type}</div>
                                      </div>
                                      <div className="flex items-center space-x-1 shrink-0">
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }); }}
                                          className={`p-1 rounded transition-colors ${layer.locked ? 'text-amber-500 hover:text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                                          title={layer.locked ? "Unlock Layer" : "Lock Layer"}
                                        >
                                          {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                                          className={`p-1 rounded transition-colors ${layer.visible ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-600 hover:text-amber-400'}`}
                                          title="Toggle Visibility"
                                        >
                                          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                                          className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )})}
                       </div>
                    )}
                 </div>
               );
            })
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
            <div className="space-y-4">
              <div className="text-center py-2 text-zinc-600 border-b border-zinc-800 pb-4">Select a layer to view properties.</div>
              <div>
                 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Global View Settings</div>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input type="checkbox" checked={project.showDimensions ?? true} onChange={(e) => useStore.getState().setProject({ showDimensions: e.target.checked })} className="accent-amber-500" />
                   <span className="text-sm text-zinc-300">Show Edge Dimensions Globally</span>
                 </label>
              </div>
            </div>
          ) : selectedLayers.length === 1 && selectedLayer ? (
            <div className="space-y-4">
              <div className="flex space-x-2 mb-4">
                 <button onClick={() => duplicateLayers([selectedLayer.id])} className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors text-xs font-medium" title="Duplicate Layer (Ctrl+D)">
                    <Copy size={14} /> <span>Duplicate</span>
                 </button>
                 <button onClick={() => moveLayersZIndex([selectedLayer.id], 'up')} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition-colors" title="Bring Forward">
                    <ArrowUp size={14} />
                 </button>
                 <button onClick={() => moveLayersZIndex([selectedLayer.id], 'front')} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition-colors" title="Bring to Front">
                    <ChevronsUp size={14} />
                 </button>
                 <button onClick={() => moveLayersZIndex([selectedLayer.id], 'down')} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition-colors" title="Send Backward">
                    <ArrowDown size={14} />
                 </button>
                 <button onClick={() => moveLayersZIndex([selectedLayer.id], 'back')} className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition-colors" title="Send to Back">
                    <ChevronsDown size={14} />
                 </button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Name</label>
                <input 
                  type="text" 
                  value={selectedLayer.name}
                  onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {selectedLayer.type === 'text' && (
                <div className="mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Text Content</label>
                  <textarea 
                    value={selectedLayer.text || ''}
                    onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                    rows={2}
                  />
                </div>
              )}

              <div className="mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Folder</label>
                <select
                  value={selectedLayer.folderId || ''}
                  onChange={(e) => updateLayer(selectedLayer.id, { folderId: e.target.value || undefined })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- No Folder --</option>
                  {folders.map(f => (
                     <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {selectedLayer.type === 'deduction' && (
                <div className="mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Parent Polygon</label>
                  <select
                    value={selectedLayer.parentId || ''}
                    onChange={(e) => updateLayer(selectedLayer.id, { parentId: e.target.value || undefined })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- No Parent (Free) --</option>
                    {layers.filter(l => ['polygon', 'rect', 'circle', 'boundary'].includes(l.type)).map(l => (
                       <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedLayer.type !== 'deduction' && selectedLayer.type !== 'boundary' && selectedLayer.type !== 'text' && selectedLayer.type !== 'arrow' && selectedLayer.type !== 'cloud' && (
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
                  {selectedLayer.materialId && materials.find(m => m.id === selectedLayer.materialId)?.options && (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Finish Option</label>
                      <select 
                        value={selectedLayer.selectedOption || ''}
                        onChange={(e) => updateLayer(selectedLayer.id, { selectedOption: e.target.value || undefined })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- Standard Finish --</option>
                        {materials.find(m => m.id === selectedLayer.materialId)!.options!.map(opt => (
                          <option key={opt.name} value={opt.name}>{opt.name} ({opt.type === 'percentage' ? '+' + opt.value + '%' : '+$' + opt.value})</option>
                        ))}
                      </select>
                    </div>
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

              {['polygon', 'polyline', 'rect', 'circle', 'boundary'].includes(selectedLayer.type) && (
                <div className="pt-2 border-t border-zinc-800">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={selectedLayer.showDimensions ?? project.showDimensions ?? true} onChange={(e) => updateLayer(selectedLayer.id, { showDimensions: e.target.checked })} className="accent-amber-500" />
                    <span className="text-sm text-zinc-300">Show Edge Dimensions</span>
                  </label>
                </div>
              )}

              <div className="pt-2 border-t border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Measurements</div>
                {['text', 'arrow', 'cloud'].includes(selectedLayer.type) ? (
                  <div className="text-zinc-300">Annotation (Excluded from BOQ)</div>
                ) : ['polygon', 'deduction', 'boundary', 'rect', 'circle'].includes(selectedLayer.type) ? (
                  <div className="text-zinc-300">{activeTab.scaleRatio ? (getPolygonArea(selectedLayer.points) / Math.pow(activeTab.scaleRatio, 2)).toFixed(2) + ' m²' : 'Uncalibrated'}</div>
                ) : selectedLayer.type === 'polyline' ? (
                  <div className="text-zinc-300">{activeTab.scaleRatio ? (getPolylineLength(selectedLayer.points) / activeTab.scaleRatio).toFixed(2) + ' m' : 'Uncalibrated'}</div>
                ) : (
                  <div className="text-zinc-300">Count: 1</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
               <div className="text-center font-semibold text-amber-500 mb-2">{selectedLayers.length} Layers Selected</div>
               
               <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Move to Folder (All)</label>
                   <select 
                     onChange={(e) => {
                       const val = e.target.value || undefined;
                       const updates = selectedLayers.map(l => ({ id: l.id, changes: { folderId: val } }));
                       useStore.getState().updateLayers(updates);
                     }}
                     className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500 mb-4"
                   >
                     <option value="">-- No Folder / Keep Current --</option>
                     {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                   </select>
               </div>
               
               <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Assign Material (All)</label>
                   <select 
                     onChange={(e) => {
                       const val = e.target.value || null;
                       const updates = selectedLayers.map(l => ({ id: l.id, changes: { materialId: val, selectedOption: undefined } }));
                       useStore.getState().updateLayers(updates);
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
                   
                   {/* Options Dropdown if all share the same material */}
                   {(() => {
                      const sharedMaterialId = selectedLayers[0].materialId;
                      const allSameMaterial = sharedMaterialId && selectedLayers.every(l => l.materialId === sharedMaterialId);
                      if (allSameMaterial) {
                         const mat = materials.find(m => m.id === sharedMaterialId);
                         if (mat && mat.options && mat.options.length > 0) {
                            return (
                               <div className="mt-4">
                                 <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Finish Option (All)</label>
                                 <select 
                                   onChange={(e) => {
                                     const val = e.target.value || undefined;
                                     const updates = selectedLayers.map(l => ({ id: l.id, changes: { selectedOption: val } }));
                                     useStore.getState().updateLayers(updates);
                                   }}
                                   className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-amber-500"
                                 >
                                   <option value="">-- Keep Current / Standard --</option>
                                   {mat.options.map(opt => (
                                      <option key={opt.name} value={opt.name}>{opt.name} ({opt.type === 'percentage' ? '+' + opt.value + '%' : '+$' + opt.value})</option>
                                   ))}
                                 </select>
                               </div>
                            );
                         }
                      }
                      return null;
                   })()}
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
                
                <div className="pt-2 border-t border-zinc-800">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" onChange={(e) => {
                       const val = e.target.checked;
                       selectedLayers.forEach(l => updateLayer(l.id, { showDimensions: val }));
                    }} className="accent-amber-500" />
                    <span className="text-sm text-zinc-300">Force Edge Dimensions On/Off (All)</span>
                  </label>
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
    </div>
  );
};
