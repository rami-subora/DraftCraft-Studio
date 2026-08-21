import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

export interface ShapeLayer {
  id: string;
  tabId: string;
  type: 'polygon' | 'polyline' | 'point' | 'deduction' | 'boundary' | 'rect' | 'circle' | 'text' | 'arrow' | 'cloud' | 'dimension';
  points: Point[];
  materialId: string | null;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity?: number;
  colorOverride?: string;
  deductions: string[];
  parentId?: string;
  selectedOption?: string;
  folderId?: string;
  text?: string;
  showDimensions?: boolean;
}

export interface LayerFolder {
  id: string;
  tabId: string;
  name: string;
  parentId?: string;
  visible: boolean;
  locked: boolean;
  color?: string;
  isExpanded?: boolean;
  showDimensions?: boolean;
}

export interface MaterialOption {
  name: string;
  type: 'flat' | 'percentage';
  value: number;
}

export interface Material {
  id: string;
  name: string;
  baseRate: number;
  color: string;
  type: 'area' | 'linear' | 'count';
  category?: string;
  image?: string;
  isCustom?: boolean;
  options?: MaterialOption[];
}

export interface ProjectTab {
  id: string;
  name: string;
  imageSrc: string | null;
  warpedImageSrc: string | null;
  warpPoints: Point[] | null;
  calibrationPoints: Point[] | null;
  scaleRatio: number | null; // px per meter
}

export interface ProjectState {
  name: string;
  tabs: ProjectTab[];
  currency: string;
  exchangeRate: number;
  bgOpacity: number;
  showGrid: boolean;
  rulerColor: string;
  showDimensions?: boolean;
  ghostingOpacity: number;
  loupeEnabled: boolean;
  magneticSnapEnabled: boolean;
}

export interface UIState {
  activeTabId: string;
  activeTool: 'select' | 'edit' | 'pan' | 'scale' | 'warp' | 'polygon' | 'polyline' | 'point' | 'deduct' | 'boundary' | 'ruler' | 'rect' | 'circle' | 'text' | 'arrow' | 'cloud';
  zoom: number;
  pan: Point;
  selectedLayerIds: string[];
  hoveredLayerId: string | null;
  currentShapePoints: Point[];
  ghostingMode: boolean;
  pricelistSyncUrl?: string;
  lastSynced?: number;
  rightSidebarWidth: number;
  leftSidebarWidth: number;
}

export interface AppState {
  project: ProjectState;
  layers: ShapeLayer[];
  pastLayers: ShapeLayer[][];
  futureLayers: ShapeLayer[][];
  materials: Material[];
  folders: LayerFolder[];
  ui: UIState;
  
  // Actions
  setProject: (project: Partial<ProjectState>) => void;
  addTab: (tab: ProjectTab) => void;
  updateTab: (id: string, updates: Partial<ProjectTab>) => void;
  deleteTab: (id: string) => void;
  
  addLayer: (layer: ShapeLayer) => void;
  setLayers: (layers: ShapeLayer[]) => void;
  updateLayer: (id: string, updates: Partial<ShapeLayer>) => void;
  updateLayers: (updates: {id: string, changes: Partial<ShapeLayer>}[]) => void;
  deleteLayer: (id: string) => void;
  addFolder: (folder: LayerFolder) => void;
  updateFolder: (id: string, updates: Partial<LayerFolder>) => void;
  deleteFolder: (id: string) => void;
  setFolders: (folders: LayerFolder[]) => void;
  clearLayers: (tabId?: string) => void;
  duplicateLayers: (ids: string[]) => void;
  moveLayersZIndex: (ids: string[], direction: 'up' | 'down' | 'front' | 'back') => void;
  undo: () => void;
  redo: () => void;
  setUI: (ui: Partial<UIState>) => void;
  setMaterials: (materials: Material[]) => void;
  addCustomMaterial: (mat: Omit<Material, 'id'>) => void;
  syncPricelist: () => Promise<void>;
}

// Initial mock materials
const mockMaterials: Material[] = [
  { id: 'mat-1', name: 'Wood Veneer', color: '#b4814e', baseRate: 150, type: 'area' },
  { id: 'mat-2', name: 'Mirror Glass', color: '#88ccff', baseRate: 85, type: 'area' },
  { id: 'mat-3', name: 'Brass Trim', color: '#cda434', baseRate: 200, type: 'linear' },
  { id: 'mat-4', name: 'Power Outlet', color: '#e5e7eb', baseRate: 25, type: 'count' },
];

export const useStore = create<AppState>((set, get) => ({
  project: {
    name: 'Untitled Project',
    tabs: [{
      id: 'tab-1',
      name: 'Drawing 1',
      imageSrc: null,
      warpedImageSrc: null,
      warpPoints: null,
      calibrationPoints: null,
      scaleRatio: null,
    }],
    currency: 'EGP',
    exchangeRate: 1,
    bgOpacity: 1,
    showGrid: false,
    rulerColor: '#fbbf24',
    showDimensions: true,
    ghostingOpacity: 0.5,
    loupeEnabled: true,
    magneticSnapEnabled: true,
  },
  layers: [],
  pastLayers: [],
  futureLayers: [],
  materials: mockMaterials,
  folders: [],
  ui: {
    activeTabId: 'tab-1',
    activeTool: 'select',
    zoom: 1,
    pan: { x: 0, y: 0 },
    selectedLayerIds: [],
    hoveredLayerId: null,
    currentShapePoints: [],
    ghostingMode: false,
    rightSidebarWidth: 320,
    leftSidebarWidth: 240,
    pricelistSyncUrl: '',
    lastSynced: undefined,
  },
  
  setProject: (updates) => set((state) => ({ project: { ...state.project, ...updates } })),
  
  addTab: (tab) => set((state) => ({ project: { ...state.project, tabs: [...state.project.tabs, tab] } })),
  updateTab: (id, updates) => set((state) => ({
    project: {
       ...state.project,
       tabs: state.project.tabs.map(t => t.id === id ? { ...t, ...updates } : t)
    }
  })),
  deleteTab: (id) => set((state) => {
    if (state.project.tabs.length <= 1) return state; // Prevent deleting last tab
    const newTabs = state.project.tabs.filter(t => t.id !== id);
    const newLayers = state.layers.filter(l => l.tabId !== id);
    const newFolders = state.folders.filter(f => f.tabId !== id);
    let newActiveTabId = state.ui.activeTabId;
    if (newActiveTabId === id) {
       newActiveTabId = newTabs[newTabs.length - 1].id;
    }
    return {
       project: { ...state.project, tabs: newTabs },
       layers: newLayers,
       folders: newFolders,
       ui: { ...state.ui, activeTabId: newActiveTabId },
       pastLayers: [...state.pastLayers, state.layers],
       futureLayers: []
    };
  }),

  addLayer: (layer) => set((state) => ({ 
    layers: [...state.layers, layer],
    pastLayers: [...state.pastLayers, state.layers],
    futureLayers: []
  })),
  setLayers: (layers) => set((state) => ({ 
    layers,
    pastLayers: [...state.pastLayers, state.layers],
    futureLayers: []
  })),
  updateLayer: (id, updates) => set((state) => {
    const updatedLayers = state.layers.map(layer => layer.id === id ? { ...layer, ...updates } : layer);
    return { 
      layers: updatedLayers,
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  updateLayers: (updates) => set((state) => {
    const updatedLayers = state.layers.map(layer => {
      const update = updates.find(u => u.id === layer.id);
      return update ? { ...layer, ...update.changes } : layer;
    });
    return { 
      layers: updatedLayers,
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  deleteLayer: (id) => set((state) => {
    const filteredLayers = state.layers.filter(layer => layer.id !== id && layer.parentId !== id);
    // Remove deduction ref
    const updatedLayers = filteredLayers.map(layer => {
      if (layer.deductions?.includes(id)) {
        return { ...layer, deductions: layer.deductions.filter(dId => dId !== id) };
      }
      return layer;
    });
    return { 
      layers: updatedLayers,
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
  updateFolder: (id, updates) => set((state) => ({
    folders: state.folders.map(f => f.id === id ? { ...f, ...updates } : f)
  })),
  deleteFolder: (id) => set((state) => {
    // Also remove folder reference from layers
    const newLayers = state.layers.map(l => l.folderId === id ? { ...l, folderId: undefined } : l);
    // Recursively delete child folders? For simplicity, we just delete the target folder and its children become root
    const newFolders = state.folders.filter(f => f.id !== id).map(f => f.parentId === id ? { ...f, parentId: undefined } : f);
    return {
       folders: newFolders,
       layers: newLayers,
       pastLayers: [...state.pastLayers, state.layers],
       futureLayers: []
    };
  }),
  setFolders: (folders) => set({ folders }),

  clearLayers: (tabId) => set((state) => {
    if (tabId) {
      return {
        layers: state.layers.filter(l => l.tabId !== tabId),
        pastLayers: [...state.pastLayers, state.layers],
        futureLayers: []
      };
    }
    return {
      layers: [],
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  duplicateLayers: (ids) => set((state) => {
    const newLayers: ShapeLayer[] = [];
    state.layers.forEach(l => {
      if (ids.includes(l.id)) {
        // Offset by 20px so it doesn't perfectly overlap
        const offset = 20 / state.ui.zoom;
        const newLayer = {
           ...l,
           id: `layer-${Date.now()}-${Math.random()}`,
           name: `${l.name} (Copy)`,
           points: l.points.map(p => ({ x: p.x + offset, y: p.y + offset }))
        };
        newLayers.push(newLayer);
      }
    });
    
    if (newLayers.length === 0) return state;
    return {
      layers: [...state.layers, ...newLayers],
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  moveLayersZIndex: (ids, direction) => set((state) => {
    let newLayers = [...state.layers];
    
    // Quick helper to move an item
    const move = (arr: any[], from: number, to: number) => {
       arr.splice(to, 0, arr.splice(from, 1)[0]);
    };

    if (direction === 'up' || direction === 'front') {
       // Move to front means moving towards the end of the array
       for (let i = newLayers.length - 1; i >= 0; i--) {
          if (ids.includes(newLayers[i].id)) {
             if (direction === 'up' && i < newLayers.length - 1) {
                move(newLayers, i, i + 1);
             } else if (direction === 'front') {
                move(newLayers, i, newLayers.length - 1);
             }
          }
       }
    } else {
       // Move back means moving towards the start of the array
       for (let i = 0; i < newLayers.length; i++) {
          if (ids.includes(newLayers[i].id)) {
             if (direction === 'down' && i > 0) {
                move(newLayers, i, i - 1);
             } else if (direction === 'back') {
                move(newLayers, i, 0);
             }
          }
       }
    }
    
    return {
      layers: newLayers,
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: []
    };
  }),

  undo: () => set((state) => {
    if (state.pastLayers.length === 0) return state;
    const previous = state.pastLayers[state.pastLayers.length - 1];
    const newPast = state.pastLayers.slice(0, -1);
    return {
      layers: previous,
      pastLayers: newPast,
      futureLayers: [state.layers, ...state.futureLayers]
    };
  }),

  redo: () => set((state) => {
    if (state.futureLayers.length === 0) return state;
    const next = state.futureLayers[0];
    const newFuture = state.futureLayers.slice(1);
    return {
      layers: next,
      pastLayers: [...state.pastLayers, state.layers],
      futureLayers: newFuture
    };
  }),

  setUI: (updates) => set((state) => ({ ui: { ...state.ui, ...updates } })),
  setMaterials: (materials) => set({ materials }),
  
  addCustomMaterial: (mat) => set((state) => ({
    materials: [...state.materials, { ...mat, id: `mat-custom-${Date.now()}`, isCustom: true }]
  })),

  syncPricelist: async () => {
    const { ui, materials, layers } = get();
    if (!ui.pricelistSyncUrl) return;

    try {
      const response = await fetch(ui.pricelistSyncUrl);
      const data = await response.json();
      
      let matsData = [];
      let optsData = [];
      if (Array.isArray(data)) {
        matsData = data;
      } else if (data && data.materials) {
        matsData = data.materials;
        optsData = data.options || [];
      } else {
        throw new Error("Invalid data format from URL");
      }

      const updatedMaterials: Material[] = [];
      const validNames = new Set<string>();

      matsData.forEach((row: any) => {
        if (!row.Name || !row.Type) return;
        validNames.add(row.Name.toLowerCase());
        
        const existingIdx = materials.findIndex(m => m.name.toLowerCase() === row.Name.toLowerCase());
        const baseRate = parseFloat(row.BaseRate) || 0;
        
        const materialOptions = optsData
          .filter((o: any) => o['Parent Item'] === row.Name && o.Name)
          .map((o: any) => {
             const typeKey = Object.keys(o).find(k => k.toLowerCase().includes('type'));
             const typeVal = typeKey ? o[typeKey]?.toString().toLowerCase() : '';
             return {
               name: o.Name,
               type: typeVal.includes('percent') ? 'percentage' : 'flat',
               value: parseFloat(o.Value || o['final value']) || 0
             };
          });
        
        if (existingIdx >= 0) {
          // Update existing material
          updatedMaterials.push({
            ...materials[existingIdx],
            type: row.Type as 'area' | 'linear' | 'count',
            baseRate: baseRate,
            color: row.Color || materials[existingIdx].color,
            category: row.Category || undefined,
            image: row.Image || undefined,
            options: materialOptions.length > 0 ? materialOptions : undefined
          });
        } else {
          // Create new material
          updatedMaterials.push({
            id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: row.Name,
            type: row.Type as 'area' | 'linear' | 'count',
            baseRate: baseRate,
            color: row.Color || `#${Math.floor(Math.random()*16777215).toString(16)}`,
            category: row.Category || undefined,
            image: row.Image || undefined,
            options: materialOptions.length > 0 ? materialOptions : undefined
          });
        }
      });

      // Find deleted materials (ignore custom ones)
      const deletedMaterialIds = materials
        .filter(m => !m.isCustom && !validNames.has(m.name.toLowerCase()))
        .map(m => m.id);
      
      let updatedLayers = layers;
      if (deletedMaterialIds.length > 0) {
        updatedLayers = layers.map(l => 
          l.materialId && deletedMaterialIds.includes(l.materialId) 
            ? { ...l, materialId: null } 
            : l
        );
      }

      set({ 
        materials: updatedMaterials, 
        layers: updatedLayers,
        ui: { ...ui, lastSynced: Date.now() } 
      });
    } catch (err) {
      console.error("Failed to sync pricelist:", err);
      throw err;
    }
  },
}));
