import { useEffect, useState } from 'react';
import { Workspace } from './components/Workspace';
import { useStore } from './store/useStore';
import { db } from './store/db';
import { PromptDialog } from './components/PromptDialog';

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { setProject } = useStore();

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
        // If empty, it uses the mockMaterials from the store automatically
      }

      const savedUI = localStorage.getItem('draftcraft-ui');
      if (savedUI) {
        try {
          const parsedUI = JSON.parse(savedUI);
          useStore.getState().setUI(parsedUI);
        } catch(e) {}
      }

      setIsLoaded(true);
    }
    loadData();
  }, [setProject]);

  // Save to DB on state change — debounced, skips pure UI changes (pan/zoom/hover)
  useEffect(() => {
    if (!isLoaded) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let prevProject: any = null;
    let prevLayers: any = null;
    let prevMaterials: any = null;

    const unsubscribe = useStore.subscribe((state) => {
      // Only persist the subset of UI state we actually care about
      const uiToSave = {
        pricelistSyncUrl: state.ui.pricelistSyncUrl,
        lastSynced: state.ui.lastSynced,
      };
      localStorage.setItem('draftcraft-ui', JSON.stringify(uiToSave));

      // Skip expensive IDB writes if only UI state changed (panning, zooming, hovering etc.)
      const projectChanged = state.project !== prevProject;
      const layersChanged = state.layers !== prevLayers;
      const materialsChanged = state.materials !== prevMaterials;
      if (!projectChanged && !layersChanged && !materialsChanged) return;

      prevProject = state.project;
      prevLayers = state.layers;
      prevMaterials = state.materials;

      // Debounce: only write to IDB after 1.5s of inactivity
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const s = useStore.getState();
        db.projects.put({ id: 'current', ...s.project });
        db.transaction('rw', db.layers, async () => {
          await db.layers.clear();
          await db.layers.bulkPut(s.layers);
        });
        db.transaction('rw', db.materials, async () => {
          await db.materials.clear();
          await db.materials.bulkPut(s.materials);
        });
      }, 1500);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [isLoaded]);


  if (!isLoaded) return <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading workspace...</div>;

  return (
    <>
      <Workspace />
      <PromptDialog />
    </>
  );
}

export default App;
