import React, { useEffect, useState } from 'react';
import { Workspace } from './components/Workspace';
import { useStore } from './store/useStore';
import { db } from './store/db';

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { setProject, addLayer, setMaterials } = useStore();

  // Load from DB on mount
  useEffect(() => {
    async function loadData() {
      const proj = await db.projects.get('current');
      if (proj) {
        const { id, ...projectData } = proj;
        setProject(projectData);
      }
      const layers = await db.layers.toArray();
      useStore.getState().setLayers(layers);
      
      const materials = await db.materials.toArray();
      if (materials.length > 0) {
        // Migrate old materials that don't have a type
        const migratedMaterials = materials.map(m => {
          if (!m.type) {
            return { ...m, type: m.name.toLowerCase().includes('trim') ? 'linear' : 'area' as any };
          }
          return m;
        });
        useStore.getState().setMaterials(migratedMaterials);
      } else {
        // If empty, it uses the mockMaterials from the store automatically
      }
      setIsLoaded(true);
    }
    loadData();
  }, [setProject]);

  // Save to DB on state change
  useEffect(() => {
    if (!isLoaded) return;
    return useStore.subscribe((state) => {
      // Debounce this in production, but fine for now
      db.projects.put({ id: 'current', ...state.project });
      
      // Sync layers (this is a bit naive, ideally we diff, but clear/put is easy for small scale)
      db.transaction('rw', db.layers, async () => {
        await db.layers.clear();
        await db.layers.bulkPut(state.layers);
      });

      db.transaction('rw', db.materials, async () => {
        await db.materials.clear();
        await db.materials.bulkPut(state.materials);
      });
    });
  }, [isLoaded]);

  if (!isLoaded) return <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading workspace...</div>;

  return <Workspace />;
}

export default App;
