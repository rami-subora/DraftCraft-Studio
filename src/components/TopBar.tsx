import { useMemo, useEffect, useState } from 'react';
import { Save, FolderOpen, Download, Image as ImageIcon, PlusCircle, Settings2, Undo2, Redo2, Trash2, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { calculateTabBOQ, calculateProjectTotal } from '../utils/boq';
import { saveDraftcraft, openDraftcraft } from '../utils/draftcraft';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { showConfirm, showPrompt } from './PromptDialog';

export function TopBar() {
  const { project, layers: allLayers, materials, setProject, setLayers, setMaterials, ui, setUI, undo, redo, clearLayers } = useStore();
  const [exchangeRateStr, setExchangeRateStr] = useState((project.exchangeRate || 1).toString());
  
  const activeTab = project.tabs.find(t => t.id === ui.activeTabId) || project.tabs[0];

  const { totalArea, grandTotalCost } = useMemo(
    () => calculateTabBOQ(activeTab, allLayers, materials, project.exchangeRate || 1),
    [allLayers, materials, activeTab, project.exchangeRate]
  );

  const projectGrandTotal = useMemo(
    () => calculateProjectTotal(project, allLayers, materials),
    [allLayers, materials, project]
  );
  const avgPrice = totalArea > 0 ? grandTotalCost / totalArea : 0;

  const handleSaveDraftcraft = async () => {
    try {
      await saveDraftcraft(project, allLayers, materials);
    } catch (err) {
      console.error(err);
      alert('Failed to save project file.');
    }
  };

  const handleOpenDraftcraft = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ok = await showConfirm(`Open "${file.name}"? This will replace your current project.`);
      if (!ok) return;
      const data = await openDraftcraft(file);
      setProject(data.project);
      setLayers(data.layers);
      setMaterials(data.materials);
      // Switch to first tab
      const firstTab = data.project.tabs[0];
      if (firstTab) setUI({ activeTabId: firstTab.id, activeTool: 'select', selectedLayerIds: [] });
    } catch (err: any) {
      alert(`Failed to open project: ${err.message || 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleNewProject = async () => {
    const ok = await showConfirm("Are you sure you want to start a new project? All unsaved progress will be lost.");
    if (ok) {
      const firstTabId = `tab-${Date.now()}`;
      // Preserve preferences but wipe content
      setProject({
        ...project,
        name: 'Untitled Project',
        tabs: [{
          id: firstTabId,
          name: 'Drawing 1',
          imageSrc: null,
          warpedImageSrc: null,
          warpPoints: null,
          calibrationPoints: null,
          scaleRatio: null,
        }],
      });
      setLayers([]);
      setUI({ activeTabId: firstTabId, activeTool: 'select', selectedLayerIds: [] });
    }
  };


  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    project.tabs.forEach((tab, index) => {
      const { lineItems, totalArea, grandTotalCost } = calculateTabBOQ(tab, allLayers, materials, project.exchangeRate || 1);
      const tabAvgPrice = totalArea > 0 ? grandTotalCost / totalArea : 0;

      const boqData: any[] = lineItems.map(li => ({
        Category: li.category,
        Material: li.materialName + (li.optionName !== 'Standard' ? ` (${li.optionName})` : ''),
        Quantity: li.qty.toFixed(2),
        Unit: li.unit,
        [`Unit Price (${project.currency})`]: li.rate.toFixed(2),
        [`Total Cost (${project.currency})`]: li.cost.toFixed(2),
      }));

      if (boqData.length > 0) {
        boqData.push({});
        boqData.push({ Category: '--- SUMMARY ---' });
        boqData.push({ Category: 'Total Area', Quantity: totalArea.toFixed(2), Unit: 'm²' });
        boqData.push({ Category: 'Average Price', [`Unit Price (${project.currency})`]: tabAvgPrice.toFixed(2), Unit: `${project.currency}/m²` });
        boqData.push({ Category: 'Tab Total', [`Total Cost (${project.currency})`]: grandTotalCost.toFixed(2) });
      }

      const ws = XLSX.utils.json_to_sheet(boqData);
      const safeTabName = (tab.name || `Tab ${index + 1}`).substring(0, 31).replace(/[\\/*?:[\]]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, safeTabName);
    });

    // Master summary sheet
    const masterData = project.tabs.map(tab => {
      const { totalArea, grandTotalCost } = calculateTabBOQ(tab, allLayers, materials, project.exchangeRate || 1);
      const avg = totalArea > 0 ? grandTotalCost / totalArea : 0;
      return {
        Tab: tab.name,
        [`Total Area (m²)`]: totalArea.toFixed(2),
        [`Avg Cost (${project.currency}/m²)`]: avg.toFixed(2),
        [`Total Cost (${project.currency})`]: grandTotalCost.toFixed(2),
      };
    });
    masterData.push({} as any);
    masterData.push({ Tab: 'GRAND TOTAL', [`Total Cost (${project.currency})`]: projectGrandTotal.toFixed(2) } as any);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterData), 'Master Summary');

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

  const handleExportPDF = async () => {
    const originalTabId = ui.activeTabId;
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      
      const summaryTableData: any[] = [];

      for (let i = 0; i < project.tabs.length; i++) {
        const tab = project.tabs[i];
        if (useStore.getState().ui.activeTabId !== tab.id) {
          useStore.getState().setUI({ activeTabId: tab.id });
          // Wait for render cycle and Konva image loading
          await new Promise(r => setTimeout(r, 1500));
        }

        const dataUrlFn = (window as any).exportStageDataUrl;
        
        // Page 1: Without Markers (Original Image)
        if (dataUrlFn) {
          doc.setFontSize(16);
          doc.text(`${tab.name} - Without Markers`, margin, margin + 10);
          
          const cleanImgSrc = dataUrlFn(true); // pass true to hide markers
          
          const imgProps = doc.getImageProperties(cleanImgSrc);
          const ratio = imgProps.width / imgProps.height;
          const maxW = pageWidth - margin * 2;
          const maxH = pageHeight - margin * 2 - 20;
          let drawW = maxW;
          let drawH = drawW / ratio;
          if (drawH > maxH) {
             drawH = maxH;
             drawW = drawH * ratio;
          }
          
          const xObj = margin + (maxW - drawW) / 2;
          const yObj = margin + 20 + (maxH - drawH) / 2;
          
          doc.addImage(cleanImgSrc, 'JPEG', xObj, yObj, drawW, drawH);
          doc.addPage();
        }

        // Page 2: With Markers (Full Canvas capture)
        if (dataUrlFn) {
           doc.setFontSize(16);
           doc.text(`${tab.name} - With Markers`, margin, margin + 10);
           
           const dataUrl = dataUrlFn();
           
           const imgProps = doc.getImageProperties(dataUrl);
           const ratio = imgProps.width / imgProps.height;
           const maxW = pageWidth - margin * 2;
           const maxH = pageHeight - margin * 2 - 20;
           let drawW = maxW;
           let drawH = drawW / ratio;
           if (drawH > maxH) {
              drawH = maxH;
              drawW = drawH * ratio;
           }
           
           const xObj = margin + (maxW - drawW) / 2;
           const yObj = margin + 20 + (maxH - drawH) / 2;
           
           doc.addImage(dataUrl, 'JPEG', xObj, yObj, drawW, drawH);
           doc.addPage();
        }

        // Page 3: Project Details & BOQ for this tab
        doc.setFontSize(18);
        doc.text(`${tab.name} - Details & BOQ`, margin, margin + 10);
        
        doc.setFontSize(12);
        let startY = margin + 20;
        doc.text(`Project Name: ${project.name || 'Untitled Project'}`, margin, startY);
        startY += 8;
        
        const tabLayers = allLayers.filter(l => l.tabId === tab.id);
        const { totalArea: tabArea, grandTotalCost: tabCost, lineItems: tabLineItems } = calculateTabBOQ(tab, allLayers, materials, project.exchangeRate || 1);
        const tabAvgPrice = tabArea > 0 ? tabCost / tabArea : 0;

        summaryTableData.push([
           tab.name,
           tabArea.toFixed(2) + ' m²',
           project.currency + tabAvgPrice.toFixed(2),
           project.currency + tabCost.toFixed(2)
        ]);

        // Calculate boundary dimensions
        const boundaryLayer = tabLayers.find(l => l.type === 'boundary');
        if (boundaryLayer && tab.scaleRatio) {
           const xs = boundaryLayer.points.map(p => p.x);
           const ys = boundaryLayer.points.map(p => p.y);
           const widthM = (Math.max(...xs) - Math.min(...xs)) / tab.scaleRatio;
           const heightM = (Math.max(...ys) - Math.min(...ys)) / tab.scaleRatio;
           doc.text(`Boundary Dimensions: ${widthM.toFixed(2)}m (W) x ${heightM.toFixed(2)}m (H)`, margin, startY);
           startY += 8;
        }
        
        doc.text(`Tab Area: ${tabArea.toFixed(2)} m²`, margin, startY);
        startY += 8;
        doc.text(`Tab Cost: ${project.currency}${tabCost.toFixed(2)}`, margin, startY);
        startY += 8;
        doc.text(`Avg Cost: ${project.currency}${tabAvgPrice.toFixed(2)} / m²`, margin, startY);
        startY += 12;

        // BOQ Table from centralized data
        if (tabLineItems.length > 0) {
           autoTable(doc, {
              startY: startY,
              head: [['Material', 'Quantity', 'Unit', `Unit Price (${project.currency})`, `Total Cost (${project.currency})`]],
              body: tabLineItems.map(li => [
                 li.materialName + (li.optionName !== 'Standard' ? ` (${li.optionName})` : ''),
                 li.qty.toFixed(2),
                 li.unit,
                 li.rate.toFixed(2),
                 li.cost.toFixed(2),
              ]),
              theme: 'grid',
              headStyles: { fillColor: [59, 130, 246] }
           });
        } else {
           doc.text("No Bill of Quantities data available.", margin, startY);
        }
        
        // Add a new page for the next tab, unless it's the last one
        if (i < project.tabs.length - 1) {
          doc.addPage();
        }
      }
      
      // Page N: Grand Total Summary
      doc.addPage();
      doc.setFontSize(22);
      doc.text("Project Grand Total", margin, margin + 20);
      
      summaryTableData.push([
         '---', '---', '---', '---'
      ]);
      summaryTableData.push([
         'GRAND TOTAL',
         '-',
         '-',
         project.currency + projectGrandTotal.toFixed(2)
      ]);

      autoTable(doc, {
         startY: margin + 30,
         head: [['Tab Name', 'Total Area', 'Avg Cost', 'Total Cost']],
         body: summaryTableData,
         theme: 'grid',
         headStyles: { fillColor: [59, 130, 246] },
         footStyles: { fillColor: [245, 158, 11] },
         didParseCell: function (data) {
             if (data.row.index === summaryTableData.length - 1) {
                 data.cell.styles.fontStyle = 'bold';
                 data.cell.styles.fillColor = [245, 158, 11]; // amber-500
                 data.cell.styles.textColor = [0, 0, 0];
             }
         }
      });

      doc.save(`${project.name || 'Project_Export'}.pdf`);
      
    } catch (err) {
      console.error(err);
      alert('Failed to export PDF.');
    } finally {
      if (ui.activeTabId !== originalTabId) {
        setUI({ activeTabId: originalTabId });
      }
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
          <div 
            className="flex items-center space-x-2 text-zinc-100 hover:text-amber-500 cursor-pointer transition-colors"
            title="Edit Project Name"
            onClick={async () => {
              const newName = await showPrompt("Enter project name:", project.name || "Untitled Project");
              if (newName && newName.trim()) {
                setProject({ name: newName.trim() });
              }
            }}
          >
            <img src="/favicon.svg" alt="Logo" className="w-5 h-5 opacity-90" />
            <span className="font-bold text-lg tracking-tight">{project.name || "Untitled Project"}</span>
          </div>
          
          <div className="flex items-center space-x-1 text-sm text-zinc-400">
            <button onClick={handleNewProject} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 text-amber-500" title="New Project">
              <PlusCircle size={16} />
              <span className="ml-1">New</span>
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-2"></div>

            <button onClick={undo} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Undo (Ctrl+Z)">
              <Undo2 size={16} />
            </button>
            <button onClick={redo} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={16} />
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-2"></div>
            
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

            <button onClick={async () => { 
              const ok = await showConfirm("Clear all layers?");
              if (ok) clearLayers(); 
            }} className="px-3 py-1 hover:bg-zinc-800 hover:text-red-400 rounded transition-colors flex items-center space-x-1" title="Clear All Layers">
              <Trash2 size={16} />
            </button>

            <label className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 cursor-pointer" title="Open .draftcraft project">
              <FolderOpen size={16} />
              <span className="ml-1">Open</span>
              <input type="file" accept=".draftcraft" className="hidden" onChange={handleOpenDraftcraft} />
            </label>
            <button onClick={handleSaveDraftcraft} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1 text-emerald-400" title="Save .draftcraft project">
              <Save size={16} />
              <span className="ml-1">Save</span>
            </button>
            <button onClick={handleExportDrawing} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Export Image (PNG)">
              <ImageIcon size={16} />
            </button>
            <button onClick={handleExportPDF} className="px-3 py-1 hover:bg-zinc-800 hover:text-zinc-100 rounded transition-colors flex items-center space-x-1" title="Export Report (PDF)">
              <FileText size={16} />
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

        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-6 bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700">
            <div className="flex flex-col items-end">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Tab Area</span>
              <span className="text-zinc-200 font-mono font-medium">{totalArea.toFixed(2)} m²</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Tab Avg</span>
              <span className="text-zinc-200 font-mono font-medium">{project.currency}{avgPrice.toFixed(2)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Tab Cost</span>
              <span className="text-amber-400 font-mono font-bold">{project.currency}{grandTotalCost.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            <span className="text-amber-500/80 text-[10px] uppercase tracking-wider font-semibold">Project Total</span>
            <span className="text-amber-500 font-mono font-bold text-base">{project.currency}{projectGrandTotal.toFixed(2)}</span>
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
                    value={project.rulerColor}
                    onChange={(e) => useStore.getState().setProject({ rulerColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-sm text-zinc-300">{project.rulerColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Background Image Opacity</label>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={project.bgOpacity}
                  onChange={(e) => useStore.getState().setProject({ bgOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="text-right text-xs text-zinc-500 mt-1">{Math.round(project.bgOpacity * 100)}%</div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Grid Overlay</label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="checkbox" 
                    checked={project.showGrid}
                    onChange={(e) => useStore.getState().setProject({ showGrid: e.target.checked })}
                    className="accent-amber-500 w-4 h-4"
                  />
                  <span className="text-sm text-zinc-300">Show Architectural Grid</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Background Ghosting Opacity (Inactive Tool)</label>
                <input 
                  type="range" min="0" max="1" step="0.05"
                  value={project.ghostingOpacity}
                  onChange={(e) => useStore.getState().setProject({ ghostingOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500"
                />
                <div className="text-right text-xs text-zinc-500 mt-1">{Math.round(project.ghostingOpacity * 100)}%</div>
              </div>              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Currency</label>
                  <select 
                    value={project.currency}
                    onChange={(e) => useStore.getState().setProject({ currency: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-sm mb-2"
                  >
                    <option value="EGP">EGP</option>
                    <option value="$">$ (USD)</option>
                    <option value="€">€ (EUR)</option>
                    <option value="£">£ (GBP)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Markup / Exch. Rate</label>
                  <input 
                    type="number"
                    step="any"
                    min="0"
                    value={exchangeRateStr}
                    onChange={(e) => {
                       setExchangeRateStr(e.target.value);
                       const val = parseFloat(e.target.value);
                       if (!isNaN(val)) useStore.getState().setProject({ exchangeRate: val });
                    }}
                    onBlur={(e) => {
                       const val = parseFloat(e.target.value);
                       if (isNaN(val) || val <= 0) {
                          setExchangeRateStr('1');
                          useStore.getState().setProject({ exchangeRate: 1 });
                       }
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-sm mb-2"
                    title="Multiply all prices by this value (e.g. 1.14 for +14% markup)"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                 <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Cursor Magnifier (Loupe)</label>
                 <input 
                   type="checkbox" 
                   checked={project.loupeEnabled}
                   onChange={(e) => useStore.getState().setProject({ loupeEnabled: e.target.checked })}
                   className="accent-amber-500 w-4 h-4"
                 />
              </div>

              <div className="flex items-center justify-between">
                 <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Magnetic Snapping</label>
                 <input 
                   type="checkbox" 
                   checked={project.magneticSnapEnabled}
                   onChange={(e) => useStore.getState().setProject({ magneticSnapEnabled: e.target.checked })}
                   className="accent-amber-500 w-4 h-4"
                 />
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
