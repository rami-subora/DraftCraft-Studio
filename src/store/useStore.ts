import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

export interface ShapeLayer {
  id: string;
  type: 'polygon' | 'polyline' | 'point' | 'deduction';
  points: Point[];
  materialId: string | null;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  deductions: string[]; // IDs of child deduction shapes
  parentId?: string; // ID of parent shape if this is a deduction
  colorOverride?: string;
}

export interface Material {
  id: string;
  name: string;
  color: string;
  baseRate: number;
  type: 'area' | 'linear' | 'count';
  category?: string;
  image?: string;
}

export interface ProjectState {
  name: string;
  imageSrc: string | null;
  warpedImageSrc: string | null;
  warpPoints: Point[] | null;
  calibrationPoints: Point[] | null;
  scaleRatio: number | null; // px per meter
}

export interface UIState {
  activeTool: 'select' | 'pan' | 'scale' | 'warp' | 'polygon' | 'polyline' | 'point' | 'deduct' | 'boundary' | 'ruler' | 'rect' | 'circle';
  selectedLayerIds: string[];
  zoom: number;
  pan: Point;
  ghostingMode: boolean;
  currentShapePoints: Point[]; // For drawing new shapes
  rulerColor: string;
  ghostingOpacity: number;
  pricelistSyncUrl: string;
  lastSynced: number | null;
}

export interface AppState {
  project: ProjectState;
  layers: ShapeLayer[];
  pastLayers: ShapeLayer[][];
  futureLayers: ShapeLayer[][];
  materials: Material[];
  ui: UIState;
  
  // Actions
  setProject: (project: Partial<ProjectState>) => void;
  addLayer: (layer: ShapeLayer) => void;
  setLayers: (layers: ShapeLayer[]) => void;
  updateLayer: (id: string, updates: Partial<ShapeLayer>) => void;
  deleteLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setUI: (ui: Partial<UIState>) => void;
  setMaterials: (materials: Material[]) => void;
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
    imageSrc: null,
    warpedImageSrc: null,
    warpPoints: null,
    calibrationPoints: null,
    scaleRatio: null,
  },
  layers: [],
  pastLayers: [],
  futureLayers: [],
  materials: mockMaterials,
  ui: {
    activeTool: 'select',
    selectedLayerIds: [],
    zoom: 1,
    pan: { x: 0, y: 0 },
    ghostingMode: false,
    currentShapePoints: [],
    rulerColor: '#38bdf8',
    ghostingOpacity: 0.3,
    pricelistSyncUrl: '',
    lastSynced: null
  },
  
  setProject: (updates) => set((state) => ({ project: { ...state.project, ...updates } })),
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
  updateLayer: (id, updates) => set((state) => ({
    layers: state.layers.map(layer => layer.id === id ? { ...layer, ...updates } : layer),
    pastLayers: [...state.pastLayers, state.layers],
    futureLayers: []
  })),
  deleteLayer: (id) => set((state) => {
    // If we delete a parent, we should ideally delete its deductions, but for now we just remove the layer
    const filteredLayers = state.layers.filter(layer => layer.id !== id && layer.parentId !== id);
    // Also remove this ID from any parent's deductions array
    const updatedLayers = filteredLayers.map(layer => {
      if (layer.deductions.includes(id)) {
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
  
  syncPricelist: async () => {
    const { ui, materials, layers } = get();
    if (!ui.pricelistSyncUrl) return;

    try {
      const response = await fetch(ui.pricelistSyncUrl);
      const data = await response.json();
      
      if (!Array.isArray(data)) throw new Error("Invalid data format from URL");

      const updatedMaterials: Material[] = [];
      const validNames = new Set<string>();

      data.forEach((row: any) => {
        if (!row.Name || !row.Type) return;
        validNames.add(row.Name.toLowerCase());
        
        const existingIdx = materials.findIndex(m => m.name.toLowerCase() === row.Name.toLowerCase());
        const baseRate = parseFloat(row.BaseRate) || 0;
        
        if (existingIdx >= 0) {
          // Update existing material
          updatedMaterials.push({
            ...materials[existingIdx],
            type: row.Type as 'area' | 'linear' | 'count',
            baseRate: baseRate,
            color: row.Color || materials[existingIdx].color,
            category: row.Category || undefined,
            image: row.Image || undefined
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
            image: row.Image || undefined
          });
        }
      });

      // Find deleted materials
      const deletedMaterialIds = materials.filter(m => !validNames.has(m.name.toLowerCase())).map(m => m.id);
      
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
