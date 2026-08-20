import React, { useCallback, useState, useEffect } from 'react';
import { TopBar } from './TopBar';
import { LeftToolbar } from './LeftToolbar';
import { RightSidebar } from './RightSidebar';
import { CanvasViewport } from './CanvasViewport';
import { useStore } from '../store/useStore';
import { UploadCloud } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Use CDN for worker to avoid Vite build configuration issues for this prototype
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export function Workspace() {
  const { setProject } = useStore();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handleDragOverGlobal = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDropGlobal = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', handleDragOverGlobal);
    window.addEventListener('drop', handleDropGlobal);
    return () => {
      window.removeEventListener('dragover', handleDragOverGlobal);
      window.removeEventListener('drop', handleDropGlobal);
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  useEffect(() => {
    const handleImportFile = (e: any) => {
      if (e.detail?.file) processFile(e.detail.file);
    };
    window.addEventListener('import-file', handleImportFile);
    return () => window.removeEventListener('import-file', handleImportFile);
  }, []);

  const processFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProject({
          imageSrc: e.target?.result as string,
          warpedImageSrc: null,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1); // Get first page
        const viewport = page.getViewport({ scale: 2.0 }); // Scale for better resolution
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        setProject({
          imageSrc: canvas.toDataURL('image/png'),
          warpedImageSrc: null,
          name: file.name
        });
      } catch (err) {
        console.error('Error rendering PDF:', err);
        alert('Failed to parse PDF.');
      }
    }
  };

  // Second duplicate handleDrop removed
  return (
    <div 
      className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-200"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden relative">
        <LeftToolbar />
        <CanvasViewport />
        <RightSidebar />
        
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 bg-zinc-900/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-amber-500 border-dashed m-4 rounded-xl transition-all">
            <UploadCloud size={64} className="text-amber-500 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Drop blueprint here</h2>
            <p className="text-zinc-400">Supports PNG, JPG, WebP, and single-page PDF</p>
          </div>
        )}
      </div>
    </div>
  );
}
