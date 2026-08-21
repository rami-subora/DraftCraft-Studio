import { useState, useEffect } from 'react';

let resolvePrompt: ((value: string | null) => void) | null = null;
let resolveConfirm: ((value: boolean) => void) | null = null;

export const showPrompt = (title: string, defaultValue: string = ''): Promise<string | null> => {
  return new Promise((resolve) => {
    resolvePrompt = resolve;
    window.dispatchEvent(new CustomEvent('show-prompt', { detail: { title, defaultValue, isConfirm: false } }));
  });
};

export const showConfirm = (title: string): Promise<boolean> => {
  return new Promise((resolve) => {
    resolveConfirm = resolve;
    window.dispatchEvent(new CustomEvent('show-prompt', { detail: { title, defaultValue: '', isConfirm: true } }));
  });
};

export function PromptDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [isConfirm, setIsConfirm] = useState(false);

  useEffect(() => {
    const handleShow = (e: any) => {
      setTitle(e.detail.title);
      setValue(e.detail.defaultValue);
      setIsConfirm(e.detail.isConfirm);
      setIsOpen(true);
    };
    window.addEventListener('show-prompt', handleShow);
    return () => window.removeEventListener('show-prompt', handleShow);
  }, []);

  const handleClose = (result: string | null | boolean) => {
    setIsOpen(false);
    if (isConfirm) {
      if (resolveConfirm) {
        resolveConfirm(result as boolean);
        resolveConfirm = null;
      }
    } else {
      if (resolvePrompt) {
        resolvePrompt(result as string | null);
        resolvePrompt = null;
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-sm shadow-2xl transform scale-100 animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-lg font-bold text-zinc-100 mb-4">{title}</h2>
        
        {!isConfirm && (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleClose(value);
              if (e.key === 'Escape') handleClose(null);
            }}
            autoFocus
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-amber-500 mb-6"
          />
        )}
        
        {isConfirm && <div className="mb-6"></div>}

        <div className="flex justify-end space-x-3">
          <button 
            onClick={() => handleClose(isConfirm ? false : null)}
            className="px-4 py-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => handleClose(isConfirm ? true : value)}
            className="px-4 py-2 rounded bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
