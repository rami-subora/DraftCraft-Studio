import Dexie, { type Table } from 'dexie';
import type { ProjectState, ShapeLayer, Material } from './useStore';

export interface DbProject extends ProjectState {
  id: string; // Singleton ID for autosave
}

export class DraftCraftDB extends Dexie {
  projects!: Table<DbProject, string>;
  layers!: Table<ShapeLayer, string>;
  materials!: Table<Material, string>;

  constructor() {
    super('DraftCraftDB');
    this.version(1).stores({
      projects: 'id',
      layers: 'id',
      materials: 'id'
    });
  }
}

export const db = new DraftCraftDB();
