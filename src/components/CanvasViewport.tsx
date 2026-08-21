import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Transformer, Group, Arrow } from 'react-konva';
import { useStore } from '../store/useStore';
import type { Point, ShapeLayer } from '../store/useStore';
import useImage from 'use-image';
import { createPerspectiveTransform } from '../utils/transform';
import { pointInPolygon, getSnapTarget } from '../utils/geometry';
import { Rect } from 'react-konva';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import Konva from 'konva';
import { showPrompt } from './PromptDialog';
import { magicWandTrace } from '../utils/magicWand';

export function CanvasViewport() {
  const { project, ui, layers: allLayers, materials, addLayer, setUI, updateLayer, deleteLayer, updateTab } = useStore();
  const activeTab = project.tabs.find(t => t.id === ui.activeTabId) || project.tabs[0];
  const [image] = useImage(activeTab?.warpedImageSrc || activeTab?.imageSrc || '');
  const layers = allLayers.filter(l => l.tabId === ui.activeTabId);
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const marqueeDragFinishedRef = useRef(false);
  const imageElRef = useRef<HTMLImageElement | null>(null);
  
  // State for drawing
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [snapPoint, setSnapPoint] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point, end: Point } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<Point[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        useStore.getState().redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        const { ui, duplicateLayers } = useStore.getState();
        if (ui.selectedLayerIds.length > 0) {
           duplicateLayers(ui.selectedLayerIds);
        }
        return;
      }

      if (key === 'escape') {
        setUI({ currentShapePoints: [], activeTool: 'select' });
        setRulerPoints([]);
      } else if (key === 'enter' && ui.currentShapePoints.length > 0) {
        finishDrawingShape();
      } else if (key === 'v') setUI({ activeTool: 'select' });
      else if (key === 'h' || e.code === 'Space') setUI({ activeTool: 'pan' });
      else if (key === 'p') setUI({ activeTool: 'polygon', currentShapePoints: [] });
      else if (key === 'l') setUI({ activeTool: 'polyline', currentShapePoints: [] });
      else if (key === 'm') setUI({ activeTool: 'point', currentShapePoints: [] });
      else if (key === 'x') setUI({ activeTool: 'deduct', currentShapePoints: [] });
      else if (key === 'w') setUI({ activeTool: 'warp', currentShapePoints: [] });
      else if (key === 'c') setUI({ activeTool: 'scale', currentShapePoints: [] });
      else if (key === 'b') setUI({ activeTool: 'boundary', currentShapePoints: [] });
      else if (key === 'r') setUI({ activeTool: 'rect', currentShapePoints: [] });
      else if (key === 'o') setUI({ activeTool: 'circle', currentShapePoints: [] });
      else if (key === 'u') setUI({ activeTool: 'ruler', currentShapePoints: [] });
      else if (key === 't') setUI({ activeTool: 'text', currentShapePoints: [] });
      else if (key === 'a') setUI({ activeTool: 'arrow', currentShapePoints: [] });
      else if (key === 'k') setUI({ activeTool: 'cloud', currentShapePoints: [] });
      else if (key === 'g') setUI({ activeTool: 'wand', currentShapePoints: [] });
      else if (key === 'delete' || key === 'backspace') {
        if (ui.selectedLayerIds.length > 0) {
          ui.selectedLayerIds.forEach(id => useStore.getState().deleteLayer(id));
          setUI({ selectedLayerIds: [] });
        }
      } else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if ((ui.activeTool === 'select' || ui.activeTool === 'edit') && ui.selectedLayerIds.length > 0) {
           e.preventDefault();
           const amount = (e.shiftKey ? 10 : 1) / ui.zoom;
           let dx = 0, dy = 0;
           if (key === 'arrowup') dy = -amount;
           if (key === 'arrowdown') dy = amount;
           if (key === 'arrowleft') dx = -amount;
           if (key === 'arrowright') dx = amount;

           const updates: { id: string; changes: any }[] = [];
           ui.selectedLayerIds.forEach(id => {
              const layer = useStore.getState().layers.find(l => l.id === id);
              if (layer && layer.type !== 'point') {
                 const newPoints = layer.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                 updates.push({ id, changes: { points: newPoints } });
                 
                 // Nudge bound child deductions ONLY if the child itself is NOT also selected
                 // (prevents double-nudging when parent and child are both selected)
                 const children = useStore.getState().layers.filter(l =>
                    l.type === 'deduction' &&
                    l.parentId === id &&
                    !ui.selectedLayerIds.includes(l.id)  // skip if already selected
                 );
                 children.forEach(child => {
                    const childNewPoints = child.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    updates.push({ id: child.id, changes: { points: childNewPoints } });
                 });
              }
           });
           if (updates.length > 0) useStore.getState().updateLayers(updates);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ui.currentShapePoints, ui.activeTool, ui.selectedLayerIds]);

  // Update Transformer node
  useEffect(() => {
    if (ui.activeTool === 'select' && ui.selectedLayerIds.length > 0 && transformerRef.current && stageRef.current) {
      const nodes = ui.selectedLayerIds.map(id => stageRef.current.findOne(`#${id}`)).filter(Boolean);
      transformerRef.current.nodes(nodes);
      
      const allPoints = ui.selectedLayerIds.every(id => layers.find(l => l.id === id)?.type === 'point');
      transformerRef.current.resizeEnabled(!allPoints);
      transformerRef.current.rotateEnabled(!allPoints);
      
      transformerRef.current.getLayer().batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
  }, [ui.selectedLayerIds, ui.activeTool, layers]);

  useEffect(() => {
    (window as any).exportStageDataUrl = (hideMarkers = false) => {
      if (!stageRef.current) return null;
      const stage = stageRef.current;
      const oldScaleX = stage.scaleX();
      const oldScaleY = stage.scaleY();
      const oldX = stage.x();
      const oldY = stage.y();
      
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();

      const width = image ? image.width : stage.width();
      const height = image ? image.height : stage.height();

      let pixelRatio = 1;
      const maxDim = 2500;
      if (Math.max(width, height) > maxDim) {
         pixelRatio = maxDim / Math.max(width, height);
      }

      if (hideMarkers) {
         // Find the shapes layer by index (it's always the second layer, after the background)
         // Use a name-based search to be safe: hide all layers except the first (background)
         const children = stage.getChildren();
         // Layer 0 = background image layer, Layer 1+ = shapes/markers layers
         for (let li = 1; li < children.length; li++) {
            children[li].hide();
         }
      }

      // Add a temporary solid background to prevent black backgrounds in JPEG
      const bgLayer = new Konva.Layer();
      const bgRect = new Konva.Rect({ x: 0, y: 0, width, height, fill: '#09090b' });
      bgLayer.add(bgRect);
      stage.add(bgLayer);
      bgLayer.moveToBottom();
      
      stage.draw(); // Force synchronous draw so hide() takes effect

      const dataUrl = stage.toDataURL({
         pixelRatio,
         mimeType: 'image/jpeg',
         quality: 0.7,
         x: 0,
         y: 0,
         width,
         height
      });

      bgLayer.destroy();

      if (hideMarkers) {
         const children = stage.getChildren();
         if (children.length > 1) children[1].show();
      }

      stage.scale({ x: oldScaleX, y: oldScaleY });
      stage.position({ x: oldX, y: oldY });
      stage.batchDraw();
      
      return dataUrl;
    };
    return () => { delete (window as any).exportStageDataUrl; };
  }, [image]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setUI({ zoom: newScale });
    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    setUI({ pan: newPos });
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    if (project.magneticSnapEnabled && ['polygon', 'polyline', 'deduct', 'rect', 'circle', 'boundary', 'ruler', 'dimension'].includes(ui.activeTool)) {
       const snapThreshold = 15 / ui.zoom;
       const snapPos = getSnapTarget(pos, layers.filter(l => l.visible), snapThreshold);
       setSnapPoint(snapPos);
       setMousePos(snapPos || pos);
    } else {
       setSnapPoint(null);
       setMousePos(pos);
    }

    if (isMiddlePanning) {
      const newPos = {
        x: stage.x() + e.evt.movementX,
        y: stage.y() + e.evt.movementY
      };
      stage.position(newPos);
      stage.batchDraw();
    } else if (marquee) {
      setMarquee({ ...marquee, end: pos });
    }
  };

  const handleMouseDown = (e: any) => {
    if (e.evt.button === 1) { // Middle click
      e.evt.preventDefault();
      setIsMiddlePanning(true);
      document.body.style.cursor = 'grab';
    } else if (ui.activeTool === 'select' && (e.target === stageRef.current || e.target.attrs.image)) {
      const pos = stageRef.current.getRelativePointerPosition();
      if (pos) {
        setMarquee({ start: pos, end: pos });
        marqueeDragFinishedRef.current = false;
      }
    }
  };

  const handleMouseUp = (e: any) => {
    if (e.evt.button === 1) {
      setIsMiddlePanning(false);
      document.body.style.cursor = 'default';
      const stage = e.target.getStage();
      if (stage) setUI({ pan: { x: stage.x(), y: stage.y() } });
    } else if (marquee) {
      const box = {
        minX: Math.min(marquee.start.x, marquee.end.x),
        maxX: Math.max(marquee.start.x, marquee.end.x),
        minY: Math.min(marquee.start.y, marquee.end.y),
        maxY: Math.max(marquee.start.y, marquee.end.y)
      };
      const selected = layers.filter(layer => {
         if (!layer.visible || layer.locked) return false;
         return layer.points.some(p => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY);
      }).map(l => l.id);
      
      if (e.evt.shiftKey) {
         setUI({ selectedLayerIds: [...new Set([...ui.selectedLayerIds, ...selected])] });
      } else {
         setUI({ selectedLayerIds: selected });
      }
      
      const distance = Math.hypot(marquee.end.x - marquee.start.x, marquee.end.y - marquee.start.y);
      if (distance > 5) {
         marqueeDragFinishedRef.current = true;
      }
      
      setMarquee(null);
    }
  };

  const finishDrawingShape = (finalPoint?: Point) => {
    if (ui.currentShapePoints.length === 0) return;
    const pts = finalPoint ? [...ui.currentShapePoints, finalPoint] : ui.currentShapePoints;
    let type: ShapeLayer['type'] = 'polygon';
    const now = Date.now();

    if (ui.activeTool === 'polyline') type = 'polyline';
    else if (ui.activeTool === 'deduct') type = 'deduction';
    else if (ui.activeTool === 'arrow') type = 'arrow';
    else if (ui.activeTool === 'cloud') type = 'cloud';
    else if (ui.activeTool === 'dimension') type = 'dimension';

    let parentId = undefined;
    if (type === 'deduction') {
      const parent = layers.find(l => ['polygon', 'rect', 'circle'].includes(l.type) && pointInPolygon(pts[0], l.points));
      if (parent) {
         parentId = parent.id;
      }
    }

    let folderId = undefined;
    if (type === 'dimension') {
      const state = useStore.getState();
      let dimFolder = state.folders.find(f => f.name === 'Dimensions' && f.tabId === ui.activeTabId);
      if (!dimFolder) {
        dimFolder = { id: `folder-${Date.now()}`, tabId: ui.activeTabId, name: 'Dimensions', visible: true, locked: false, isExpanded: true };
        state.addFolder(dimFolder);
      }
      folderId = dimFolder.id;
    }

    // Annotations (text/arrow/cloud/dimension) should be fully opaque by default
    const isAnnotation = ['arrow', 'cloud', 'dimension'].includes(type);

    addLayer({
      id: `layer-${now}`,
      tabId: ui.activeTabId,
      type,
      points: pts,
      materialId: null,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: isAnnotation ? 1 : 0.45,
      deductions: [],
      parentId,
      folderId
    });
    setUI({ currentShapePoints: [] });
  };

  const handleStageClick = async (e: any) => {
    if (isMiddlePanning || ui.activeTool === 'pan' || e.evt.button !== 0) return;
    
    if (marqueeDragFinishedRef.current) {
       marqueeDragFinishedRef.current = false;
       return;
    }

    if (ui.activeTool === 'select' && (e.target === stageRef.current || e.target.attrs.image)) {
      setUI({ selectedLayerIds: [] });
      return;
    }

    const stage = e.target.getStage();
    let pointerPosition = stage.getRelativePointerPosition();
    if (!pointerPosition) return;
    
    if (e.evt.shiftKey && ui.currentShapePoints.length > 0) {
      const lastPoint = ui.currentShapePoints[ui.currentShapePoints.length - 1];
      const dx = pointerPosition.x - lastPoint.x;
      const dy = pointerPosition.y - lastPoint.y;
      if (Math.abs(dx) > Math.abs(dy)) pointerPosition = { x: pointerPosition.x, y: lastPoint.y };
      else pointerPosition = { x: lastPoint.x, y: pointerPosition.y };
    }

    if (ui.activeTool === 'warp') {
      const currentPoints = activeTab.warpPoints || [];
      if (currentPoints.length < 4) {
        const newWarpPoints = [...currentPoints, pointerPosition];
        updateTab(ui.activeTabId, { warpPoints: newWarpPoints });
        
        if (newWarpPoints.length === 4) {
          // applyWarp is triggered via the floating button; auto-apply here
          setUI({ activeTool: 'select' });
        }
      }
    } else if (ui.activeTool === 'scale') {
      let newPoints: Point[];
      if (activeTab.calibrationPoints && activeTab.calibrationPoints.length === 2) {
         newPoints = [pointerPosition];
      } else {
         newPoints = activeTab.calibrationPoints ? [...activeTab.calibrationPoints, pointerPosition] : [pointerPosition];
      }
      updateTab(ui.activeTabId, { calibrationPoints: newPoints });
      
      if (newPoints.length === 2) {
         const distancePx = Math.hypot(newPoints[1].x - newPoints[0].x, newPoints[1].y - newPoints[0].y);
         const currentTabId = ui.activeTabId; // Capture tab ID before async
         showPrompt("Enter actual length in meters:", "1").then(val => {
           const actualMeters = parseFloat(val || "0");
           if (actualMeters > 0) {
              updateTab(currentTabId, { scaleRatio: distancePx / actualMeters, calibrationPoints: null });
           } else {
              updateTab(currentTabId, { calibrationPoints: null, scaleRatio: null });
           }
           useStore.getState().setUI({ activeTool: 'select' });
         });
      }
    } else if (ui.activeTool === 'ruler') {
      if (rulerPoints.length === 0) setRulerPoints([pointerPosition]);
      else if (rulerPoints.length === 1) setRulerPoints([rulerPoints[0], pointerPosition]);
      else setRulerPoints([pointerPosition]);
    } else if (['rect', 'circle', 'boundary'].includes(ui.activeTool)) {
      if (ui.currentShapePoints.length === 0) {
        setUI({ currentShapePoints: [pointerPosition] });
      } else if (ui.currentShapePoints.length === 1) {
        const p1 = ui.currentShapePoints[0];
        const p2 = pointerPosition;
        let type: ShapeLayer['type'] = 'polygon';
        let finalPoints: Point[] = [];
        
        if (ui.activeTool === 'boundary') {
           type = 'boundary';
           finalPoints = [p1, {x: p2.x, y: p1.y}, p2, {x: p1.x, y: p2.y}];
        } else if (ui.activeTool === 'rect') {
           type = 'polygon';
           finalPoints = [p1, {x: p2.x, y: p1.y}, p2, {x: p1.x, y: p2.y}];
        } else if (ui.activeTool === 'circle') {
           type = 'polygon';
           const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
           for (let i = 0; i < 32; i++) {
             const theta = (i / 32) * 2 * Math.PI;
             finalPoints.push({ x: p1.x + r * Math.cos(theta), y: p1.y + r * Math.sin(theta) });
           }
        }
        
        addLayer({
          id: `layer-${Date.now()}`,
          tabId: ui.activeTabId,
          type,
          points: finalPoints,
          materialId: null,
          name: `${ui.activeTool === 'boundary' ? 'Boundary' : ui.activeTool === 'rect' ? 'Rectangle' : 'Circle'} ${layers.length + 1}`,
          visible: true,
          locked: false,
          opacity: 0.25,
          deductions: []
        });
        setUI({ currentShapePoints: [] });
      }
    } else if (ui.activeTool === 'arrow' || ui.activeTool === 'dimension') {
      // Arrow/Dimension: first click sets start point, second click sets end point and finishes
      if (ui.currentShapePoints.length === 0) {
        setUI({ currentShapePoints: [pointerPosition] });
      } else {
        finishDrawingShape(pointerPosition);
      }
      return;
    } else if (ui.activeTool === 'cloud') {
      // Cloud: click to add points, close by clicking near start
      if (ui.currentShapePoints.length > 2) {
        const first = ui.currentShapePoints[0];
        const dist = Math.hypot(pointerPosition.x - first.x, pointerPosition.y - first.y);
        if (dist < 15 / ui.zoom) {
          finishDrawingShape();
          return;
        }
      }
      setUI({ currentShapePoints: [...ui.currentShapePoints, pointerPosition] });
    } else if (['polygon', 'polyline', 'deduct'].includes(ui.activeTool)) {
      if (ui.currentShapePoints.length > 2 && (ui.activeTool === 'polygon' || ui.activeTool === 'deduct')) {
        const first = ui.currentShapePoints[0];
        const dist = Math.hypot(pointerPosition.x - first.x, pointerPosition.y - first.y);
        if (dist < 10 / ui.zoom) {
          finishDrawingShape();
          return;
        }
      }
      setUI({ currentShapePoints: [...ui.currentShapePoints, pointerPosition] });
    } else if (ui.activeTool === 'text') {
      const currentTabId = ui.activeTabId;
      const currentLayersLength = layers.length;
      showPrompt("Enter text label:", "Label").then(defaultText => {
        if (!defaultText) {
           useStore.getState().setUI({ activeTool: 'select' });
           return;
        }
        useStore.getState().addLayer({
          id: `layer-${Date.now()}`,
          tabId: currentTabId,
          type: 'text',
          points: [pointerPosition],
          materialId: null,
          name: `Text ${currentLayersLength + 1}`,
          visible: true,
          locked: false,
          opacity: 1,
          text: defaultText,
          deductions: []
        });
        useStore.getState().setUI({ activeTool: 'select' });
      });
    } else if (ui.activeTool === 'point') {
      addLayer({
        id: `layer-${Date.now()}`,
        tabId: ui.activeTabId,
        type: 'point',
        points: [pointerPosition],
        materialId: null,
        name: `Point ${layers.length + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        deductions: []
      });
    } else if (ui.activeTool === 'wand') {
      // Magic wand: get image element and trace at click point
      const imgSrc = activeTab?.warpedImageSrc || activeTab?.imageSrc;
      if (!imgSrc) return;

      // Build or reuse cached image element
      if (!imageElRef.current || imageElRef.current.src !== imgSrc) {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.src = imgSrc;
        imageElRef.current = el;
        if (!el.complete) {
          await new Promise(res => { el.onload = res; el.onerror = res; });
        }
      }
      const imgEl = imageElRef.current;
      if (!imgEl || !imgEl.complete) return;

      // pointerPosition is already in canvas (image) coordinate space
      const pts = magicWandTrace(imgEl, pointerPosition.x, pointerPosition.y, ui.wandTolerance);
      if (pts.length < 3) { alert('Could not detect a clear region. Try adjusting the tolerance.'); return; }

      const now = Date.now();
      addLayer({
        id: `layer-${now}`,
        tabId: ui.activeTabId,
        type: 'polygon',
        points: pts,
        materialId: null,
        name: `Wand ${layers.length + 1}`,
        visible: true,
        locked: false,
        opacity: 0.45,
        deductions: []
      });
      setUI({ selectedLayerIds: [`layer-${now}`] });
    }
  };

  const handleStageDblClick = (_e: any) => {
    if (ui.activeTool === 'polyline' && ui.currentShapePoints.length > 1) {
      finishDrawingShape();
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    
    const layerId = node.id();
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    const newPoints = layer.points.map(p => {
      const transformed = node.getTransform().point({ x: p.x, y: p.y });
      return { x: transformed.x, y: transformed.y };
    });

    node.scaleX(1);
    node.scaleY(1);
    node.rotation(0);
    node.position({ x: 0, y: 0 });

    const updates: { id: string; changes: any }[] = [];
    updates.push({ id: layerId, changes: { points: newPoints } });

    const children = layers.filter(l => l.type === 'deduction' && l.parentId === layerId);
    if (children.length > 0) {
       children.forEach(child => {
          const childNewPoints = child.points.map(p => {
             const transformed = node.getTransform().point({ x: p.x, y: p.y });
             return { x: transformed.x, y: transformed.y };
          });
          updates.push({ id: child.id, changes: { points: childNewPoints } });
       });
    }
    useStore.getState().updateLayers(updates);
  };

  const handleDragEnd = (e: any) => {
    const node = e.target;
    const layerId = node.id();
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    const pos = node.position();
    let newPoints;
    
    // point and text both use x/y props directly — store as absolute position
    if (layer.type === 'point' || layer.type === 'text') {
       newPoints = [{ x: pos.x, y: pos.y }];
    } else {
       newPoints = layer.points.map(p => ({ x: p.x + pos.x, y: p.y + pos.y }));
       node.position({ x: 0, y: 0 });
    }

    const updates: { id: string; changes: any }[] = [];
    updates.push({ id: layerId, changes: { points: newPoints } });

    const children = layers.filter(l => l.type === 'deduction' && l.parentId === layerId);
    if (children.length > 0 && layer.type !== 'point' && layer.type !== 'text') {
       children.forEach(child => {
          const childNewPoints = child.points.map(p => ({ x: p.x + pos.x, y: p.y + pos.y }));
          updates.push({ id: child.id, changes: { points: childNewPoints } });
       });
    }
    useStore.getState().updateLayers(updates);
  };

  const applyWarp = () => {
    if (!activeTab.warpPoints || activeTab.warpPoints.length !== 4 || !image) return;
    const [p1, p2, p3, p4] = activeTab.warpPoints;
    const srcCorners = [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y];
    const w1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const w2 = Math.hypot(p4.x - p3.x, p4.y - p3.y);
    const dstWidth = Math.round(Math.max(w1, w2));
    const h1 = Math.hypot(p4.x - p1.x, p4.y - p1.y);
    const h2 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const dstHeight = Math.round(Math.max(h1, h2));
    const dstCorners = [0, 0, dstWidth, 0, dstWidth, dstHeight, 0, dstHeight];
    const pTransform = createPerspectiveTransform(dstCorners, srcCorners);
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = image.width;
    srcCanvas.height = image.height;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return;
    srcCtx.drawImage(image, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, image.width, image.height);
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = dstWidth;
    dstCanvas.height = dstHeight;
    const dstCtx = dstCanvas.getContext('2d');
    if (!dstCtx) return;
    const dstData = dstCtx.createImageData(dstWidth, dstHeight);
    for (let y = 0; y < dstHeight; y++) {
      for (let x = 0; x < dstWidth; x++) {
        const [srcX, srcY] = pTransform.transform(x, y);
        const sx = Math.round(srcX);
        const sy = Math.round(srcY);
        if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height) {
          const srcIdx = (sy * image.width + sx) * 4;
          const dstIdx = (y * dstWidth + x) * 4;
          dstData.data[dstIdx] = srcData.data[srcIdx];
          dstData.data[dstIdx+1] = srcData.data[srcIdx+1];
          dstData.data[dstIdx+2] = srcData.data[srcIdx+2];
          dstData.data[dstIdx+3] = srcData.data[srcIdx+3];
        }
      }
    }
    dstCtx.putImageData(dstData, 0, 0);
    updateTab(ui.activeTabId, { warpedImageSrc: dstCanvas.toDataURL(), warpPoints: null });
    setUI({ activeTool: 'select' });
  };

  const renderEdgeDimensions = (layer: ShapeLayer, color: string) => {
    const showDims = layer.showDimensions ?? project.showDimensions ?? true;
    if (!showDims || !activeTab.scaleRatio) return null;
    const pts = layer.points;
    if (pts.length < 2) return null;

    const isClosed = ['polygon', 'deduction', 'boundary', 'rect', 'circle'].includes(layer.type);
    const elements = [];
    const edgeCount = isClosed ? pts.length : pts.length - 1;

    for (let i = 0; i < edgeCount; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const distM = (distPx / activeTab.scaleRatio).toFixed(2);
      
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      
      let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

      elements.push(
        <Text
          key={`${layer.id}-edge-${i}`}
          x={midX}
          y={midY}
          text={`${distM}m`}
          fontSize={12 / ui.zoom}
          fill={color}
          rotation={angle * (180 / Math.PI)}
          align="center"
          verticalAlign="middle"
          fontFamily="monospace"
          fontStyle="bold"
          shadowColor="rgba(0,0,0,0.8)"
          shadowBlur={3 / ui.zoom}
          offsetX={0}
          offsetY={12 / ui.zoom}
          listening={false}
        />
      );
    }
    return elements;
  };

  const renderShapes = () => {
    return layers.filter(l => l.tabId === ui.activeTabId).map(layer => {
      if (!layer.visible) return null;
      const isSelected = ui.selectedLayerIds.includes(layer.id);
      const isHovered = ui.hoveredLayerId === layer.id;
      
      const mat = materials.find(m => m.id === layer.materialId);
      let color = layer.colorOverride || mat?.color;
      if (!color) {
        if (layer.type === 'deduction') color = '#ef4444';
        else if (layer.type === 'boundary') color = '#f59e0b';
        else if (['polygon', 'rect', 'circle'].includes(layer.type)) color = '#3b82f6';
        else if (layer.type === 'polyline') color = '#10b981';
        else if (layer.type === 'point') color = '#8b5cf6';
        else if (layer.type === 'dimension') color = project.rulerColor;
        else color = '#52525b';
      }
      
      const isSelectMode = ui.activeTool === 'select';
      const opacity = layer.opacity ?? 0.45;

      const handleDragStartAlt = (e: any) => {
        if (layer.locked) return;
        if (e.evt.altKey) {
           const cloneId = `layer-${Date.now()}`;
           addLayer({ ...layer, id: cloneId, name: `${layer.name} Copy` });
           setUI({ selectedLayerIds: [cloneId] });
        }
      };

      const handleClick = (e: any) => {
        if (layer.locked) return;
        if (!isSelectMode && ui.activeTool !== 'edit') return;
        if (e.evt.shiftKey) {
          const isAlreadySelected = ui.selectedLayerIds.includes(layer.id);
          if (isAlreadySelected) {
            setUI({ selectedLayerIds: ui.selectedLayerIds.filter(id => id !== layer.id) });
          } else {
            setUI({ selectedLayerIds: [...ui.selectedLayerIds, layer.id] });
          }
        } else {
          setUI({ selectedLayerIds: [layer.id] });
        }
      };
      
      const mouseHandlers = {
         onMouseEnter: () => setUI({ hoveredLayerId: layer.id }),
         onMouseLeave: () => setUI({ hoveredLayerId: null })
      };

      if (['polygon', 'deduction', 'boundary', 'rect', 'circle'].includes(layer.type)) {
        return (
          <Group
            key={layer.id}
            id={layer.id}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
            {...mouseHandlers}
          >
            <Line
              points={layer.points.flatMap(p => [p.x, p.y])}
              fill={layer.type === 'deduction' ? 'transparent' : color}
              stroke={isSelected ? '#fff' : isHovered ? '#fbbf24' : color}
              strokeWidth={isSelected ? 4.5 / ui.zoom : isHovered ? 4 / ui.zoom : 3 / ui.zoom}
              shadowBlur={isHovered ? 10 / ui.zoom : 0}
              shadowColor={color}
              closed
              opacity={opacity}
            />
            {renderEdgeDimensions(layer, isSelected ? '#fff' : color)}
          </Group>
        );
      } else if (layer.type === 'polyline') {
        return (
          <Group
            key={layer.id}
            id={layer.id}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
            {...mouseHandlers}
          >
            <Line
              points={layer.points.flatMap(p => [p.x, p.y])}
              stroke={isSelected ? '#fff' : isHovered ? '#fbbf24' : color}
              strokeWidth={isSelected ? 5.5 / ui.zoom : isHovered ? 4.5 / ui.zoom : 3.5 / ui.zoom}
              shadowBlur={isHovered ? 10 / ui.zoom : 0}
              shadowColor={color}
              opacity={opacity}
            />
            {renderEdgeDimensions(layer, isSelected ? '#fff' : color)}
          </Group>
        );
      } else if (layer.type === 'point') {
        return (
          <Circle
            key={layer.id}
            id={layer.id}
            x={layer.points[0].x}
            y={layer.points[0].y}
            radius={8 / ui.zoom}
            fill={color}
            stroke={isSelected ? '#fff' : isHovered ? '#fbbf24' : 'transparent'}
            strokeWidth={isHovered ? 3 / ui.zoom : 2 / ui.zoom}
            shadowBlur={isHovered ? 10 / ui.zoom : 0}
            shadowColor={color}
            opacity={opacity}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
            {...mouseHandlers}
          />
        );
      } else if (layer.type === 'text') {
        // Fixed font size in canvas units (not zoom-relative so text stays readable at all zoom levels)
        const fontSize = 16 / ui.zoom;
        return (
          <Text
            key={layer.id}
            id={layer.id}
            x={layer.points[0].x}
            y={layer.points[0].y}
            text={layer.text || 'Text'}
            fontSize={fontSize}
            fontFamily="Inter, sans-serif"
            fontStyle={isSelected ? 'bold' : 'normal'}
            fill={isSelected ? '#fbbf24' : color}
            stroke={isSelected ? 'rgba(0,0,0,0.4)' : undefined}
            strokeWidth={isSelected ? 0.5 / ui.zoom : 0}
            shadowColor="rgba(0,0,0,0.8)"
            shadowBlur={4 / ui.zoom}
            opacity={opacity}
            draggable={isSelectMode && !layer.locked}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            {...mouseHandlers}
          />
        );
      } else if (layer.type === 'arrow') {
        return (
          <Arrow
            key={layer.id}
            id={layer.id}
            points={layer.points.flatMap(p => [p.x, p.y])}
            stroke={isSelected ? '#fff' : isHovered ? '#fbbf24' : color}
            fill={isSelected ? '#fff' : isHovered ? '#fbbf24' : color}
            strokeWidth={isSelected ? 4 / ui.zoom : isHovered ? 3 / ui.zoom : 2 / ui.zoom}
            pointerLength={10 / ui.zoom}
            pointerWidth={10 / ui.zoom}
            opacity={opacity}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
            {...mouseHandlers}
          />
        );
      } else if (layer.type === 'cloud') {
        // Build arc-based revision cloud path from the control points
        if (layer.points.length < 2) return null;
        const cloudPts = [...layer.points, layer.points[0]]; // close the loop
        const arcPoints: number[] = [];
        const arcRadius = 12 / ui.zoom;
        for (let i = 0; i < cloudPts.length - 1; i++) {
          const from = cloudPts[i];
          const to = cloudPts[i + 1];
          const segLen = Math.hypot(to.x - from.x, to.y - from.y);
          const steps = Math.max(1, Math.round(segLen / (arcRadius * 2.5)));
          for (let s = 0; s < steps; s++) {
            const t0 = s / steps;
            const t1 = (s + 1) / steps;
            const mx = from.x + (to.x - from.x) * ((t0 + t1) / 2);
            const my = from.y + (to.y - from.y) * ((t0 + t1) / 2);
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const perpX = -Math.sin(angle);
            const perpY = Math.cos(angle);
            // Bump center outward for convex arc effect
            const cx = mx + perpX * arcRadius * 0.5;
            const cy = my + perpY * arcRadius * 0.5;
            for (let a = 0; a <= 8; a++) {
              const theta = Math.PI + (a / 8) * Math.PI;
              arcPoints.push(cx + Math.cos(angle + theta) * arcRadius * 0.7);
              arcPoints.push(cy + Math.sin(angle + theta) * arcRadius * 0.7);
            }
          }
        }
        return (
          <Line
            key={layer.id}
            id={layer.id}
            points={arcPoints}
            stroke={isSelected ? '#fbbf24' : isHovered ? '#fbbf24' : color}
            strokeWidth={isSelected ? 2.5 / ui.zoom : 1.5 / ui.zoom}
            lineJoin="round"
            lineCap="round"
            tension={0.3}
            fill="transparent"
            opacity={opacity}
            draggable={isSelectMode && !layer.locked}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            {...mouseHandlers}
          />
        );
      } else if (layer.type === 'dimension') {
        if (layer.points.length < 2) return null;
        const p1 = layer.points[0];
        const p2 = layer.points[1];
        
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const defaultTextY = midY - 20 / ui.zoom;
        const textPos = layer.points[2] || { x: midX, y: defaultTextY };
        
        return (
          <Group
            key={layer.id}
            id={layer.id}
            opacity={opacity}
            draggable={isSelectMode && !layer.locked}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            {...mouseHandlers}
          >
            <Line
              points={[p1.x, p1.y, p2.x, p2.y]}
              stroke={isSelected ? '#fbbf24' : color}
              strokeWidth={isSelected ? 3 / ui.zoom : 2 / ui.zoom}
              dash={[5 / ui.zoom, 5 / ui.zoom]}
            />
            {layer.points[2] && (
              <Line
                points={[midX, midY, textPos.x, textPos.y]}
                stroke={isSelected ? '#fbbf24' : color}
                strokeWidth={1 / ui.zoom}
                dash={[2 / ui.zoom, 2 / ui.zoom]}
              />
            )}
            <Text
              x={textPos.x}
              y={textPos.y}
              draggable={isSelectMode && !layer.locked}
              onDragStart={(e) => {
                 e.cancelBubble = true;
                 if (isSelectMode) setUI({ selectedLayerIds: [layer.id] });
              }}
              onDragEnd={(e) => {
                 e.cancelBubble = true;
                 const newPts = [...layer.points];
                 newPts[2] = { x: e.target.x(), y: e.target.y() };
                 updateLayer(layer.id, { points: newPts });
              }}
              text={activeTab.scaleRatio ? (Math.hypot(p2.x - p1.x, p2.y - p1.y) / activeTab.scaleRatio).toFixed(2) + 'm' : 'Uncalibrated'}
              fontSize={14 / ui.zoom}
              fill={isSelected ? '#fbbf24' : color}
              fontFamily="monospace"
              fontStyle="bold"
              shadowColor="rgba(0,0,0,0.8)"
              shadowBlur={4 / ui.zoom}
            />
          </Group>
        );
      }
      return null;
    });
  };

  return (
    <div className="flex-1 bg-zinc-950 overflow-hidden relative" style={{ cursor: (isMiddlePanning || ui.activeTool === 'pan') ? 'grab' : ['polygon','polyline','point','deduct','warp','scale','rect','circle','boundary','ruler','text','arrow','cloud','dimension','wand'].includes(ui.activeTool) ? 'crosshair' : 'default' }}>
      <div className="absolute bottom-4 left-4 text-xs font-mono text-zinc-500 z-10 pointer-events-none">
        Zoom: {Math.round(ui.zoom * 100)}% | Active Tool: {ui.activeTool.toUpperCase()} | Points: {ui.currentShapePoints.length}
      </div>

      {ui.activeTool === 'warp' && activeTab.warpPoints?.length === 4 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 p-2 rounded shadow-lg flex items-center space-x-2">
          <button onClick={applyWarp} className="bg-amber-500 text-black px-4 py-1 font-bold rounded text-sm hover:bg-amber-400">Apply Warp</button>
          <button onClick={() => updateTab(ui.activeTabId, { warpPoints: null })} className="bg-zinc-700 text-zinc-200 px-4 py-1 font-bold rounded text-sm hover:bg-zinc-600">Clear</button>
        </div>
      )}

      {ui.activeTool === 'select' && ui.selectedLayerIds.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-900 border border-zinc-700 p-1.5 rounded shadow-lg flex items-center space-x-1">
          <button 
            onClick={() => {
               ui.selectedLayerIds.forEach(id => {
                  const layer = layers.find(l => l.id === id);
                  if (layer) updateLayer(layer.id, { visible: !layer.visible });
               });
            }} 
            className="text-zinc-300 hover:text-amber-400 hover:bg-zinc-800 px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            Toggle Hide
          </button>
          <button 
            onClick={() => {
               const newIds: string[] = [];
               ui.selectedLayerIds.forEach(id => {
                  const layer = layers.find(l => l.id === id);
                  if (layer) {
                     const cloneId = `layer-${Date.now()}-${Math.random()}`;
                     addLayer({ ...layer, id: cloneId, name: `${layer.name} Copy` });
                     newIds.push(cloneId);
                  }
               });
               setUI({ selectedLayerIds: newIds });
            }} 
            className="text-zinc-300 hover:text-white hover:bg-zinc-800 px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            Duplicate
          </button>
          <div className="w-px h-4 bg-zinc-700 mx-1"></div>
          <button 
            onClick={() => {
              ui.selectedLayerIds.forEach(id => deleteLayer(id));
              setUI({ selectedLayerIds: [] });
            }} 
            className="text-red-400 hover:text-red-300 hover:bg-zinc-800 px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      <Stage
        width={window.innerWidth - ui.leftSidebarWidth - ui.rightSidebarWidth}
        height={window.innerHeight - 48} // 48 is TopBar height
        draggable={isMiddlePanning || ui.activeTool === 'pan'}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragEnd={(e) => {
          if (isMiddlePanning || ui.activeTool === 'pan') {
            setUI({ pan: { x: e.target.x(), y: e.target.y() } });
          }
        }}
        ref={stageRef}
        scaleX={ui.zoom}
        scaleY={ui.zoom}
        x={ui.pan.x}
        y={ui.pan.y}
      >
        <Layer>
          {project.showGrid && (
            <Group>
              <Rect
                x={-ui.pan.x / ui.zoom}
                y={-ui.pan.y / ui.zoom}
                width={(window.innerWidth - ui.leftSidebarWidth - ui.rightSidebarWidth) / ui.zoom}
                height={(window.innerHeight - 48) / ui.zoom}
                fillPatternImage={(() => {
                   const canvas = document.createElement('canvas');
                   canvas.width = 40;
                   canvas.height = 40;
                   const ctx = canvas.getContext('2d');
                   if(ctx) {
                      ctx.strokeStyle = '#3f3f46';
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.moveTo(0, 0);
                      ctx.lineTo(40, 0);
                      ctx.moveTo(0, 0);
                      ctx.lineTo(0, 40);
                      ctx.stroke();
                   }
                   return canvas as any;
                })()}
                opacity={0.3}
                listening={false}
              />
            </Group>
          )}

          <Group>
            {image && (
              <KonvaImage 
                image={image} 
                opacity={ui.ghostingMode && ui.activeTool !== 'select' && ui.activeTool !== 'edit' ? project.ghostingOpacity : project.bgOpacity}
              />
            )}
          </Group>
        </Layer>
        
        <Layer>
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.end.x)}
              y={Math.min(marquee.start.y, marquee.end.y)}
              width={Math.abs(marquee.end.x - marquee.start.x)}
              height={Math.abs(marquee.end.y - marquee.start.y)}
              fill="rgba(59, 130, 246, 0.2)"
              stroke="#3b82f6"
              strokeWidth={1 / ui.zoom}
            />
          )}
          {renderShapes()}
          <Transformer ref={transformerRef} boundBoxFunc={(_oldBox, newBox) => newBox} />

          {/* Edit Mode Vertices */}
          {ui.activeTool === 'edit' && ui.selectedLayerIds.map(layerId => {
             const layer = layers.find(l => l.id === layerId);
             if (!layer || !['polygon', 'polyline', 'boundary', 'deduction'].includes(layer.type)) return null;
             
             return layer.points.map((p, i) => (
                <Circle 
                  key={`${layer.id}-pt-${i}`}
                  x={p.x} y={p.y} radius={6 / ui.zoom}
                  fill="#fff" stroke="#3b82f6" strokeWidth={2 / ui.zoom}
                  draggable
                  onDragMove={(e) => {
                     const stage = e.target.getStage();
                     if (!stage) return;
                     const newPoints = [...layer.points];
                     newPoints[i] = { x: e.target.x(), y: e.target.y() };
                     updateLayer(layer.id, { points: newPoints });
                  }}
                  onDragEnd={(e) => {
                     const newPoints = [...layer.points];
                     newPoints[i] = { x: e.target.x(), y: e.target.y() };
                     updateLayer(layer.id, { points: newPoints });
                  }}
                  onMouseEnter={() => {
                     document.body.style.cursor = 'pointer';
                  }}
                  onMouseLeave={() => {
                     document.body.style.cursor = 'crosshair';
                  }}
                />
             ));
          })}

          {/* Current Shape Drawing */}
          {ui.currentShapePoints.length > 0 && (
            ['polygon', 'polyline', 'deduct', 'arrow', 'cloud', 'dimension'].includes(ui.activeTool) ? (
              <Line
                points={ui.currentShapePoints.flatMap(p => [p.x, p.y]).concat(mousePos ? [mousePos.x, mousePos.y] : [])}
                stroke="#fbbf24"
                strokeWidth={2 / ui.zoom}
                dash={ui.activeTool === 'cloud' ? [15 / ui.zoom, 10 / ui.zoom] : [5 / ui.zoom, 5 / ui.zoom]}
              />
            ) : ['rect', 'boundary'].includes(ui.activeTool) && mousePos ? (
              <Line
                points={[
                  ui.currentShapePoints[0].x, ui.currentShapePoints[0].y,
                  mousePos.x, ui.currentShapePoints[0].y,
                  mousePos.x, mousePos.y,
                  ui.currentShapePoints[0].x, mousePos.y,
                ]}
                stroke="#fbbf24"
                strokeWidth={2 / ui.zoom}
                dash={[5 / ui.zoom, 5 / ui.zoom]}
                closed
              />
            ) : ui.activeTool === 'circle' && mousePos ? (
              <Circle
                x={ui.currentShapePoints[0].x}
                y={ui.currentShapePoints[0].y}
                radius={Math.hypot(mousePos.x - ui.currentShapePoints[0].x, mousePos.y - ui.currentShapePoints[0].y)}
                stroke="#fbbf24"
                strokeWidth={2 / ui.zoom}
                dash={[5 / ui.zoom, 5 / ui.zoom]}
              />
            ) : null
          )}
          
          {snapPoint && project.magneticSnapEnabled && ui.activeTool !== 'select' && ui.activeTool !== 'edit' && (
             <Circle x={snapPoint.x} y={snapPoint.y} radius={6 / ui.zoom} stroke="#ec4899" strokeWidth={2 / ui.zoom} />
          )}

          {project.loupeEnabled && ['polygon', 'polyline', 'deduct', 'boundary', 'rect', 'circle', 'scale', 'ruler', 'dimension'].includes(ui.activeTool) && mousePos && image && (
            <Group 
              x={mousePos.x + (60 / ui.zoom)} 
              y={mousePos.y - (60 / ui.zoom)}
              clipFunc={(ctx) => {
                 ctx.arc(0, 0, 50 / ui.zoom, 0, Math.PI * 2, false);
              }}
            >
              {/* White background for the loupe */}
              <Circle radius={50 / ui.zoom} fill="#09090b" stroke="#fbbf24" strokeWidth={2 / ui.zoom} />
              
              {/* Scaled background image */}
              <Group
                scaleX={3}
                scaleY={3}
                x={-mousePos.x * 3}
                y={-mousePos.y * 3}
              >
                <KonvaImage image={image} opacity={ui.ghostingMode ? project.ghostingOpacity : 1} />
              </Group>
              
              {/* Center Crosshair inside loupe */}
              <Line points={[-5/ui.zoom, 0, 5/ui.zoom, 0]} stroke="#ec4899" strokeWidth={1/ui.zoom} />
              <Line points={[0, -5/ui.zoom, 0, 5/ui.zoom]} stroke="#ec4899" strokeWidth={1/ui.zoom} />
              <Circle radius={50/ui.zoom} stroke="#fbbf24" strokeWidth={2/ui.zoom} />
            </Group>
          )}
          
          {/* Ruler Display */}
          {(ui.activeTool === 'ruler' && rulerPoints.length > 0) && (
            <Group>
              <Line
                points={rulerPoints.flatMap(p => [p.x, p.y]).concat(rulerPoints.length === 1 && mousePos ? [mousePos.x, mousePos.y] : [])}
                stroke={project.rulerColor}
                strokeWidth={2 / ui.zoom}
                dash={[5 / ui.zoom, 5 / ui.zoom]}
              />
              {rulerPoints.length === 2 && (
                <Text
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 20 / ui.zoom}
                  text={activeTab.scaleRatio ? (Math.hypot(rulerPoints[1].x - rulerPoints[0].x, rulerPoints[1].y - rulerPoints[0].y) / activeTab.scaleRatio).toFixed(2) + 'm' : 'Uncalibrated'}
                  fontSize={14 / ui.zoom}
                  fill={project.rulerColor}
                  fontFamily="monospace"
                  fontStyle="bold"
                  shadowColor="rgba(0,0,0,0.8)"
                  shadowBlur={4 / ui.zoom}
                />
              )}
            </Group>
          )}

          {/* Calibration Points */}
          {activeTab.calibrationPoints && (
            <Group>
              {activeTab.calibrationPoints.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={5 / ui.zoom} fill="red" />
              ))}
              {(activeTab.calibrationPoints.length === 2 || (activeTab.calibrationPoints.length === 1 && mousePos && ui.activeTool === 'scale')) && (
                <Line 
                  points={activeTab.calibrationPoints.flatMap(p => [p.x, p.y]).concat(activeTab.calibrationPoints.length === 1 && mousePos && ui.activeTool === 'scale' ? [mousePos.x, mousePos.y] : [])} 
                  stroke="red" 
                  strokeWidth={2 / ui.zoom} 
                  dash={[5 / ui.zoom, 5 / ui.zoom]} 
                />
              )}
            </Group>
          )}

          {ui.activeTool === 'warp' && activeTab.warpPoints && (
            <Group>
              {activeTab.warpPoints.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={8 / ui.zoom} fill="#a855f7" />
              ))}
              {activeTab.warpPoints.length > 1 && (
                <Line 
                  points={activeTab.warpPoints.flatMap(p => [p.x, p.y])} 
                  stroke="#a855f7" 
                  strokeWidth={2 / ui.zoom} 
                  dash={[5 / ui.zoom, 5 / ui.zoom]} 
                />
              )}
            </Group>
          )}
        </Layer>
      </Stage>

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-6 right-6 flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-20">
        <button 
          onClick={() => {
             const newZoom = ui.zoom * 1.2;
             const stage = stageRef.current;
             if (!stage) return;
             const oldScale = stage.scaleX();
             const center = { x: stage.width() / 2, y: stage.height() / 2 };
             const mousePointTo = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
             const newPos = { x: center.x - mousePointTo.x * newZoom, y: center.y - mousePointTo.y * newZoom };
             setUI({ zoom: newZoom, pan: newPos });
          }} 
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors border-b border-zinc-800"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button 
          onClick={() => {
             const newZoom = ui.zoom / 1.2;
             const stage = stageRef.current;
             if (!stage) return;
             const oldScale = stage.scaleX();
             const center = { x: stage.width() / 2, y: stage.height() / 2 };
             const mousePointTo = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
             const newPos = { x: center.x - mousePointTo.x * newZoom, y: center.y - mousePointTo.y * newZoom };
             setUI({ zoom: newZoom, pan: newPos });
          }}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors border-b border-zinc-800"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button 
          onClick={() => {
             if (image) {
                const stage = stageRef.current;
                if (!stage) return;
                const scaleX = stage.width() / image.width;
                const scaleY = stage.height() / image.height;
                const fitScale = Math.min(scaleX, scaleY) * 0.95; // 5% padding
                const cx = (stage.width() - image.width * fitScale) / 2;
                const cy = (stage.height() - image.height * fitScale) / 2;
                setUI({ zoom: fitScale, pan: { x: cx, y: cy } });
             } else {
                setUI({ zoom: 1, pan: { x: 0, y: 0 } });
             }
          }}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          title="Fit to Screen"
        >
          <Maximize size={18} />
        </button>
      </div>

    </div>
  );
}
