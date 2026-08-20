import React, { useMemo, useEffect, useState } from 'react';
import { Menu, Save, FolderOpen, Download, Image as ImageIcon, PlusCircle, Settings2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getPolygonArea, getPolylineLength } from '../utils/geometry';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

export function TopBar() {
  const { project, layers, materials, setProject, setLayers, setMaterials, ui } = useStore();

  const { totalArea, grandTotalCost, projectBoundaryArea } = useMemo(() => {
    let cost = 0;
    let boundAreaPx = 0;

    layers.forEach(layer => {
      if (layer.type === 'boundary') {
        boundAreaPx += getPolygonArea(layer.points);
      } else if (layer.materialId) {
        const mat = materials.find(m => m.id === layer.materialId);
        if (mat && project.scaleRatio) {
          if (layer.type === 'polygon') {
            const area = getPolygonArea(layer.points) / (project.scaleRatio * project.scaleRatio);
            cost += area * mat.baseRate;
          } else if (layer.type === 'deduction') {
            const area = getPolygonArea(layer.points) / (project.scaleRatio * project.scaleRatio);
            cost -= area * mat.baseRate;
          } else if (layer.type === 'polyline') {
            const len = getPolylineLength(layer.points) / project.scaleRatio;
            cost += len * mat.baseRate;
          } else if (layer.type === 'point') {
            cost += 1 * mat.baseRate;
          }
        }
      }
    });

    const realBoundArea = project.scaleRatio && boundAreaPx > 0 ? boundAreaPx / (project.scaleRatio * project.scaleRatio) : 0;
    
    // If no boundary, default to total area of all drawn polygons
    let fallbackArea = 0;
    if (realBoundArea === 0 && project.scaleRatio) {
      layers.forEach(l => {
        if (l.type === 'polygon') fallbackArea += getPolygonArea(l.points) / (project.scaleRatio! * project.scaleRatio!);
        if (l.type === 'deduction') fallbackArea -= getPolygonArea(l.points) / (project.scaleRatio! * project.scaleRatio!);
      });
    }

    const finalArea = realBoundArea > 0 ? realBoundArea : fallbackArea;
    return { totalArea: finalArea, grandTotalCost: cost, projectBoundaryArea: realBoundArea };
  }, [layers, materials, project.scaleRatio]);

  const avgPrice = totalArea > 0 ? grandTotalCost / totalArea : 0;

  const handleExportJSON = () => {
    const data = JSON.stringify({ project, layers, materials });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'project'}.json`;
    a.click();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.project) setProject(data.project);
        if (data.layers) setLayers(data.layers);
        if (data.materials) setMaterials(data.materials);
      } catch (err) {
        alert("Invalid project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleNewProject = () => {
    if (confirm("Are you sure you want to start a new project? All unsaved progress will be lost.")) {
      setProject({ name: 'Untitled Project', imageSrc: null, warpedImageSrc: null, scaleRatio: null, calibrationPoints: null, warpPoints: null });
      setLayers([]);
    }
  };

  const handleExportExcel = () => {
    const boqData = materials.map(mat => {
      const matLayers = layers.filter(l => l.materialId === mat.id && l.visible);
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
      
      return {
        Material: mat.name,
        Quantity: qty.toFixed(2),
        Unit: mat.type === 'area' ? 'm²' : mat.type === 'linear' ? 'm' : 'ea',
        BaseRate: mat.baseRate,
        TotalCost: (qty * mat.baseRate).toFixed(2)
      };
    }).filter(Boolean) as any[];

    if (boqData.length > 0) {
      boqData.push({});
      boqData.push({ Material: '--- SUMMARY ---' });
      boqData.push({ Material: 'Total Area', Quantity: totalArea.toFixed(2), Unit: 'm²' });
      boqData.push({ Material: 'Average Price', BaseRate: avgPrice.toFixed(2), Unit: '$/m²' });
      boqData.push({ Material: 'Grand Total', TotalCost: grandTotalCost.toFixed(2) });
    }

    const ws = XLSX.utils.json_to_sheet(boqData as any[]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    XLSX.writeFile(wb, `${project.name || 'BOQ'}.xlsx`);
  };

  const handleExportDrawing = async () => {
    const container = document.querySelector('.konvajs-content') as HTMLElement;
    if (!container) return;
    try {
      const canvas = await html2canvas(container, { backgroundColor: '#09090b' });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${project.name || 'drawing'}_export.png`;
      a.click();
    } catch (err) {
      console.error(err);
      alert('Failed to export drawing.');
    }
  };
  
  const [showPrefs, setShowPrefs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { syncPricelist } = useStore();

  useEffect(() => {
    if (ui.pricelistSyncUrl) {
      setIsSyncing(true);
      syncPricelist().catch(err => setSyncError(err.message)).finally(() => setIsSyncing(false));
    }
  }, [ui.pricelistSyncUrl]); // Run once if URL is present (or when URL changes)

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncPricelist();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };
  return (
    <>
      <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 select-none relative z-20">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-zinc-100">
            <Menu size={20} />
            <span className="font-bold text-lg tracking-tight">DraftCraft Studio</span>
          </div>
          
          <div className="flex items-center space-x-1 text-sm text-zinc-400">
            <button onClick={handleNewProject} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 text-amber-500" title="New Project">
              <PlusCircle size={16} />
              <span className="ml-1">New</span>
            </button>
            
            <label className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 cursor-pointer text-emerald-400" title="Import Image / PDF">
              <ImageIcon size={16} />
              <span className="ml-1">Import Drawing</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => {
                 const file = e.target.files?.[0];
                 if (file) {
                   const customEvent = new CustomEvent('import-file', { detail: { file } });
                   window.dispatchEvent(customEvent);
                 }
                 e.target.value = '';
              }} />
            </label>
            <div className="w-px h-4 bg-zinc-700 mx-2"></div>

            <label className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 cursor-pointer" title="Open JSON Project">
              <FolderOpen size={16} />
              <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
            </label>
            <button onClick={handleExportJSON} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Save JSON Project">
              <Save size={16} />
            </button>
            <button onClick={handleExportDrawing} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Export Drawing (PNG)">
              <ImageIcon size={16} />
            </button>
            <button onClick={handleExportExcel} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Export BOQ (XLSX)">
              <Download size={16} />
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-1"></div>
            <button onClick={() => setShowPrefs(true)} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Preferences">
              <Settings2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-8 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Total Area</span>
            <span className="text-zinc-200 font-mono font-medium">{totalArea.toFixed(2)} m²</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Avg Price</span>
            <span className="text-zinc-200 font-mono font-medium">${avgPrice.toFixed(2)}/m²</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Grand Total</span>
            <span className="text-amber-400 font-mono font-bold text-base">${grandTotalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {showPrefs && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-lg font-bold text-zinc-100 mb-4 flex items-center"><Settings2 className="mr-2" size={20} /> Preferences</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Ruler Text Color</label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="color" 
                    value={ui.rulerColor}
                    onChange={(e) => useStore.getState().setUI({ rulerColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-sm text-zinc-300">{ui.rulerColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Background Ghosting Opacity</label>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={ui.ghostingOpacity}
                  onChange={(e) => useStore.getState().setUI({ ghostingOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="text-right text-xs text-zinc-500 mt-1">{Math.round(ui.ghostingOpacity * 100)}%</div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Live Pricelist Sync URL</label>
                <input 
                  type="text" 
                  placeholder="https://script.google.com/macros/s/..."
                  value={ui.pricelistSyncUrl}
                  onChange={(e) => useStore.getState().setUI({ pricelistSyncUrl: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-sm mb-2"
                />
                <div className="flex items-center justify-between">
                  <button 
                    onClick={handleManualSync}
                    disabled={isSyncing || !ui.pricelistSyncUrl}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  {ui.lastSynced && (
                    <span className="text-xs text-zinc-500">
                      Last synced: {new Date(ui.lastSynced).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {syncError && <div className="text-red-400 text-xs mt-1">{syncError}</div>}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowPrefs(false)} className="bg-amber-500 text-black px-4 py-2 font-bold rounded text-sm hover:bg-amber-400">Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
