import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Transformer, Group } from 'react-konva';
import { useStore } from '../store/useStore';
import type { Point, ShapeLayer } from '../store/useStore';
import useImage from 'use-image';
import { createPerspectiveTransform } from '../utils/transform';

export function CanvasViewport() {
  const { project, ui, layers, materials, addLayer, setUI, setProject, updateLayer, deleteLayer } = useStore();
  const [image] = useImage(project.warpedImageSrc || project.imageSrc || '');
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  
  // State for drawing
  const [mousePos, setMousePos] = useState<Point | null>(null);
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

      if (key === 'escape') {
        setUI({ currentShapePoints: [] });
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
      else if (key === 'delete' || key === 'backspace') {
        if (ui.selectedLayerIds.length > 0) {
          ui.selectedLayerIds.forEach(id => useStore.getState().deleteLayer(id));
          setUI({ selectedLayerIds: [] });
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
      transformerRef.current.getLayer().batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
  }, [ui.selectedLayerIds, ui.activeTool, layers]);

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
    if (pos) setMousePos(pos);

    if (isMiddlePanning) {
      const newPos = {
        x: stage.x() + e.evt.movementX,
        y: stage.y() + e.evt.movementY
      };
      stage.position(newPos);
      stage.batchDraw();
    }
  };

  const handleMouseDown = (e: any) => {
    if (e.evt.button === 1) { // Middle click
      e.evt.preventDefault();
      setIsMiddlePanning(true);
      document.body.style.cursor = 'grab';
    }
  };

  const handleMouseUp = (e: any) => {
    if (e.evt.button === 1) {
      setIsMiddlePanning(false);
      document.body.style.cursor = 'default';
      const stage = e.target.getStage();
      if (stage) setUI({ pan: { x: stage.x(), y: stage.y() } });
    }
  };

  const finishDrawingShape = () => {
    if (ui.currentShapePoints.length === 0) return;
    const pts = ui.currentShapePoints;
    let type: ShapeLayer['type'] = 'polygon';

    if (ui.activeTool === 'polyline') type = 'polyline';
    else if (ui.activeTool === 'deduct') type = 'deduction';

    addLayer({
      id: `layer-${Date.now()}`,
      type,
      points: pts,
      materialId: null,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 0.25,
      deductions: []
    });
    setUI({ currentShapePoints: [] });
  };

  const handleStageClick = (e: any) => {
    if (isMiddlePanning || ui.activeTool === 'pan' || e.evt.button !== 0) return;

    if (ui.activeTool === 'select' && e.target === stageRef.current) {
      setUI({ selectedLayerIds: [] });
      return;
    }

    if (ui.activeTool === 'select' && e.target.attrs.image) {
      // Clicking the background image should deselect
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
      const currentPoints = project.warpPoints || [];
      if (currentPoints.length < 4) setProject({ warpPoints: [...currentPoints, pointerPosition] });
    } else if (ui.activeTool === 'scale') {
      const currentPoints = project.calibrationPoints || [];
      if (currentPoints.length < 2) setProject({ calibrationPoints: [...currentPoints, pointerPosition] });
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
    } else if (ui.activeTool === 'point') {
      addLayer({
        id: `layer-${Date.now()}`,
        type: 'point',
        points: [pointerPosition],
        materialId: null,
        name: `Point ${layers.length + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        deductions: []
      });
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

    // Calculate the new points using the current transform matrix BEFORE resetting it
    const newPoints = layer.points.map(p => {
      const transformed = node.getTransform().point({ x: p.x, y: p.y });
      return { x: transformed.x, y: transformed.y };
    });

    // Reset node transform so it renders naturally from absolute points
    node.scaleX(1);
    node.scaleY(1);
    node.rotation(0);
    node.position({ x: 0, y: 0 });

    updateLayer(layerId, { points: newPoints });
  };

  const handleDragEnd = (e: any) => {
    const node = e.target;
    const layerId = node.id();
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    const pos = node.position();
    const newPoints = layer.points.map(p => ({ x: p.x + pos.x, y: p.y + pos.y }));
    node.position({ x: 0, y: 0 }); // Reset because points are absolute

    updateLayer(layerId, { points: newPoints });
  };

  const applyCalibration = () => {
    const inputStr = prompt("Enter distance in meters (e.g., 2.5):");
    if (!inputStr) return;
    const meters = parseFloat(inputStr);
    if (isNaN(meters) || meters <= 0) return alert("Invalid input.");
    
    if (project.calibrationPoints?.length === 2) {
      const [p1, p2] = project.calibrationPoints;
      const pxDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      setProject({ scaleRatio: pxDist / meters, calibrationPoints: null });
      setUI({ activeTool: 'select' });
    }
  };

  const applyWarp = () => {
    if (!project.warpPoints || project.warpPoints.length !== 4 || !image) return;
    const [p1, p2, p3, p4] = project.warpPoints;
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
    setProject({ warpedImageSrc: dstCanvas.toDataURL(), warpPoints: null });
    setUI({ activeTool: 'select' });
  };

  const renderShapes = () => {
    return layers.map(layer => {
      if (!layer.visible) return null;
      const isSelected = ui.selectedLayerIds.includes(layer.id);
      
      const mat = materials.find(m => m.id === layer.materialId);
      let color = layer.colorOverride || mat?.color;
      if (!color) {
        if (layer.type === 'deduction') color = '#ef4444';
        else if (layer.type === 'boundary') color = '#f59e0b';
        else if (['polygon', 'rect', 'circle'].includes(layer.type)) color = '#3b82f6';
        else if (layer.type === 'polyline') color = '#10b981';
        else if (layer.type === 'point') color = '#8b5cf6';
        else color = '#52525b';
      }
      
      const isSelectMode = ui.activeTool === 'select';
      const opacity = layer.opacity ?? 1;

      const handleDragStartAlt = (e: any) => {
        if (e.evt.altKey) {
           const cloneId = `layer-${Date.now()}`;
           addLayer({ ...layer, id: cloneId, name: `${layer.name} Copy` });
           setUI({ selectedLayerIds: [cloneId] });
        }
      };

      const handleClick = (e: any) => {
        if (!isSelectMode) return;
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

      if (['polygon', 'deduction', 'boundary', 'rect', 'circle'].includes(layer.type)) {
        return (
          <Line
            key={layer.id}
            id={layer.id}
            points={layer.points.flatMap(p => [p.x, p.y])}
            fill={layer.type === 'deduction' ? 'transparent' : `${color}40`}
            stroke={isSelected ? '#fff' : color}
            strokeWidth={isSelected ? 3 / ui.zoom : 1.5 / ui.zoom}
            closed
            opacity={opacity}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
          />
        );
      } else if (layer.type === 'polyline') {
        return (
          <Line
            key={layer.id}
            id={layer.id}
            points={layer.points.flatMap(p => [p.x, p.y])}
            stroke={isSelected ? '#fff' : color}
            strokeWidth={isSelected ? 4 / ui.zoom : 2 / ui.zoom}
            opacity={opacity}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
          />
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
            stroke={isSelected ? '#fff' : 'transparent'}
            strokeWidth={2 / ui.zoom}
            opacity={opacity}
            draggable={isSelectMode && isSelected}
            onDragStart={handleDragStartAlt}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
            onClick={handleClick}
          />
        );
      }
      return null;
    });
  };

  return (
    <div className="flex-1 bg-zinc-950 overflow-hidden relative" style={{ cursor: (isMiddlePanning || ui.activeTool === 'pan') ? 'grab' : ['polygon','polyline','point','deduct','warp','scale','rect','circle','boundary','ruler'].includes(ui.activeTool) ? 'crosshair' : 'default' }}>
      <div className="absolute bottom-4 left-4 text-xs font-mono text-zinc-500 z-10 pointer-events-none">
        Zoom: {Math.round(ui.zoom * 100)}% | Active Tool: {ui.activeTool.toUpperCase()} | Points: {ui.currentShapePoints.length}
      </div>

      {ui.activeTool === 'warp' && project.warpPoints?.length === 4 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 p-2 rounded shadow-lg flex items-center space-x-2">
          <button onClick={applyWarp} className="bg-amber-500 text-black px-4 py-1 font-bold rounded text-sm hover:bg-amber-400">Apply Warp</button>
          <button onClick={() => setProject({ warpPoints: null })} className="bg-zinc-700 text-zinc-200 px-4 py-1 font-bold rounded text-sm hover:bg-zinc-600">Clear</button>
        </div>
      )}

      {ui.activeTool === 'scale' && project.calibrationPoints?.length === 2 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-800 p-2 rounded shadow-lg flex items-center space-x-2">
          <button onClick={applyCalibration} className="bg-emerald-500 text-black px-4 py-1 font-bold rounded text-sm hover:bg-emerald-400">Set Scale (m)</button>
          <button onClick={() => setProject({ calibrationPoints: null })} className="bg-zinc-700 text-zinc-200 px-4 py-1 font-bold rounded text-sm hover:bg-zinc-600">Clear</button>
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
        ref={stageRef}
        width={window.innerWidth - 56 - 320}
        height={window.innerHeight - 48}
        draggable={isMiddlePanning || ui.activeTool === 'pan'}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDblClick={handleStageDblClick}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDragEnd={(e) => {
          if (isMiddlePanning || ui.activeTool === 'pan') {
            setUI({ pan: { x: e.target.x(), y: e.target.y() } });
          }
        }}
      >
        <Layer>
          {image && (
            <KonvaImage 
              image={image} 
              opacity={ui.ghostingMode ? ui.ghostingOpacity : 1}
              listening={true} // So click-to-deselect works on image
            />
          )}
        </Layer>
        
        <Layer>
          {renderShapes()}
          <Transformer ref={transformerRef} boundBoxFunc={(_oldBox, newBox) => newBox} />

          {/* Current Shape Drawing */}
          {ui.currentShapePoints.length > 0 && (
            ['polygon', 'polyline', 'deduct'].includes(ui.activeTool) ? (
              <Line
                points={ui.currentShapePoints.flatMap(p => [p.x, p.y]).concat(mousePos ? [mousePos.x, mousePos.y] : [])}
                stroke="#fbbf24"
                strokeWidth={2 / ui.zoom}
                dash={[5 / ui.zoom, 5 / ui.zoom]}
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
          
          {/* Ruler Display */}
          {(ui.activeTool === 'ruler' && rulerPoints.length > 0) && (
            <Group>
              <Line
                points={rulerPoints.flatMap(p => [p.x, p.y]).concat(rulerPoints.length === 1 && mousePos ? [mousePos.x, mousePos.y] : [])}
                stroke={ui.rulerColor}
                strokeWidth={2 / ui.zoom}
                dash={[5 / ui.zoom, 5 / ui.zoom]}
              />
              {rulerPoints.length === 2 && (
                <Text
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 20 / ui.zoom}
                  text={project.scaleRatio ? (Math.hypot(rulerPoints[1].x - rulerPoints[0].x, rulerPoints[1].y - rulerPoints[0].y) / project.scaleRatio).toFixed(2) + 'm' : 'Uncalibrated'}
                  fontSize={14 / ui.zoom}
                  fill={ui.rulerColor}
                  fontFamily="monospace"
                  fontStyle="bold"
                  shadowColor="rgba(0,0,0,0.8)"
                  shadowBlur={4 / ui.zoom}
                />
              )}
            </Group>
          )}

          {/* Warp Points */}
          {ui.activeTool === 'warp' && project.warpPoints?.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={6 / ui.zoom} fill="rgba(245, 158, 11, 0.8)" stroke="#fff" strokeWidth={2 / ui.zoom} />
          ))}
          {/* Scale Points */}
          {ui.activeTool === 'scale' && project.calibrationPoints?.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={6 / ui.zoom} fill="rgba(16, 185, 129, 0.8)" stroke="#fff" strokeWidth={2 / ui.zoom} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
