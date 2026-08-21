import { useStore } from '../store/useStore';
import { Plus, X } from 'lucide-react';
import { showConfirm, showPrompt } from './PromptDialog';

export function TabBar() {
  const { project, ui, setUI, addTab, updateTab, deleteTab } = useStore();

  const handleAddTab = () => {
    const newId = `tab-${Date.now()}`;
    addTab({
      id: newId,
      name: `Drawing ${project.tabs.length + 1}`,
      imageSrc: null,
      warpedImageSrc: null,
      warpPoints: null,
      calibrationPoints: null,
      scaleRatio: null,
    });
    setUI({ activeTabId: newId });
  };

  return (
    <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 overflow-x-auto select-none" style={{ width: `calc(100vw - ${ui.rightSidebarWidth + ui.leftSidebarWidth}px)`, marginLeft: ui.leftSidebarWidth }}>
      {project.tabs.map(tab => {
        const isActive = tab.id === ui.activeTabId;
        return (
          <div
            key={tab.id}
            className={`group flex items-center h-8 px-4 min-w-[120px] max-w-[200px] rounded-t-md border-r border-t border-l cursor-pointer transition-colors mr-1 ${
              isActive 
                ? 'bg-[#121214] border-zinc-700 text-amber-500' 
                : 'bg-zinc-800 border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
            onClick={() => {
              setUI({ activeTabId: tab.id });
            }}
            onDoubleClick={async () => {
              const newName = await showPrompt("Enter new tab name:", tab.name);
              if (newName && newName.trim()) {
                updateTab(tab.id, { name: newName.trim() });
              }
            }}
          >
            <span className="truncate flex-1 text-sm font-medium">{tab.name}</span>
            
            {project.tabs.length > 1 && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (project.tabs.length > 1) {
                    const ok = await showConfirm(`Are you sure you want to delete "${tab.name}"?`);
                    if (ok) {
                      deleteTab(tab.id);
                    }
                  }
                }}
                className={`ml-2 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity ${
                  isActive ? 'hover:bg-zinc-800 text-amber-500 hover:text-red-400' : 'hover:bg-zinc-600'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      
      <button
        onClick={handleAddTab}
        className="flex items-center justify-center w-8 h-8 ml-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
        title="Add New Tab"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
}
