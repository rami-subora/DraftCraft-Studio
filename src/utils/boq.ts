import { getPolygonArea, getPolylineLength } from './geometry';
import type { ShapeLayer, Material, ProjectTab, ProjectState } from '../store/useStore';

export interface BOQLineItem {
  materialId: string;
  materialName: string;
  materialColor: string;
  category: string;
  optionName: string;
  qty: number;
  unit: 'm²' | 'm' | 'ea';
  rate: number;       // base rate after option applied
  cost: number;       // rate * qty * exchangeRate
}

export interface TabBOQ {
  lineItems: BOQLineItem[];
  totalArea: number;       // in m², from boundary or fallback
  grandTotalCost: number;  // sum of all line item costs
  projectBoundaryArea: number;
}

/**
 * Compute resolved rate for a material + option combination.
 */
function resolveRate(mat: Material, optionName: string): number {
  let rate = mat.baseRate;
  const optData = mat.options?.find(o => o.name === optionName);
  if (optData) {
    if (optData.type === 'percentage') {
      rate = rate * (1 + optData.value / 100);
    } else {
      rate = rate + optData.value;
    }
  }
  return rate;
}

/**
 * Calculate the full BOQ for a single tab.
 *
 * FIX: Global deductions (no parentId) are now collected once per material group,
 * not subtracted once per each parent layer (which caused N-fold over-subtraction).
 */
export function calculateTabBOQ(
  tab: ProjectTab,
  allLayers: ShapeLayer[],
  materials: Material[],
  exchangeRate: number
): TabBOQ {
  const tabLayers = allLayers.filter(l => l.tabId === tab.id && l.visible);
  const scaleRatio = tab.scaleRatio;

  // --- Boundary / total area ---
  let boundAreaPx = 0;
  const allTabLayers = allLayers.filter(l => l.tabId === tab.id);
  allTabLayers.forEach(l => {
    if (l.type === 'boundary') boundAreaPx += getPolygonArea(l.points);
  });
  const projectBoundaryArea = scaleRatio && boundAreaPx > 0
    ? boundAreaPx / (scaleRatio * scaleRatio)
    : 0;

  let fallbackArea = 0;
  if (projectBoundaryArea === 0 && scaleRatio) {
    tabLayers.forEach(l => {
      if (l.type === 'polygon') fallbackArea += getPolygonArea(l.points) / (scaleRatio * scaleRatio);
      if (l.type === 'deduction') fallbackArea -= getPolygonArea(l.points) / (scaleRatio * scaleRatio);
    });
    fallbackArea = Math.max(0, fallbackArea);
  }
  const totalArea = projectBoundaryArea > 0 ? projectBoundaryArea : fallbackArea;

  // --- Global (unparented) deductions — computed ONCE, not per-layer ---
  const globalDeductions = tabLayers.filter(dl => dl.type === 'deduction' && !dl.parentId);
  const globalDeductionAreaPx = globalDeductions.reduce((sum, dl) => sum + getPolygonArea(dl.points), 0);

  // --- Line items per material × option ---
  const lineItems: BOQLineItem[] = [];

  materials.forEach(mat => {
    const matLayers = tabLayers.filter(l => l.materialId === mat.id);
    if (matLayers.length === 0) return;

    // Group by selected option
    const byOption = new Map<string, ShapeLayer[]>();
    matLayers.forEach(l => {
      const opt = l.selectedOption || 'Standard';
      if (!byOption.has(opt)) byOption.set(opt, []);
      byOption.get(opt)!.push(l);
    });

    byOption.forEach((optLayers, optionName) => {
      let qty = 0;

      optLayers.forEach(l => {
        if (['polygon', 'rect', 'circle'].includes(l.type) && scaleRatio) {
          const areaPx = getPolygonArea(l.points);
          // Subtract bound (child) deductions for this specific parent
          const childDeductionPx = tabLayers
            .filter(dl => dl.type === 'deduction' && dl.parentId === l.id)
            .reduce((sum, dl) => sum + getPolygonArea(dl.points), 0);
          qty += (areaPx - childDeductionPx) / (scaleRatio * scaleRatio);
        } else if (l.type === 'polyline' && scaleRatio) {
          qty += getPolylineLength(l.points) / scaleRatio;
        } else if (l.type === 'point') {
          qty += 1;
        }
      });

      // Subtract global deductions once for area materials
      if (mat.type === 'area' && scaleRatio && globalDeductionAreaPx > 0) {
        qty -= globalDeductionAreaPx / (scaleRatio * scaleRatio);
      }

      qty = Math.max(0, qty);
      if (qty === 0) return;

      const rate = resolveRate(mat, optionName);
      const cost = qty * rate * exchangeRate;
      const unit: BOQLineItem['unit'] = mat.type === 'area' ? 'm²' : mat.type === 'linear' ? 'm' : 'ea';

      lineItems.push({
        materialId: mat.id,
        materialName: mat.name,
        materialColor: mat.color,
        category: mat.category || 'Uncategorized',
        optionName,
        qty,
        unit,
        rate: rate * exchangeRate,
        cost,
      });
    });
  });

  const grandTotalCost = lineItems.reduce((s, li) => s + li.cost, 0);

  return { lineItems, totalArea, grandTotalCost, projectBoundaryArea };
}

/**
 * Calculate the grand total across all tabs.
 */
export function calculateProjectTotal(
  project: ProjectState,
  allLayers: ShapeLayer[],
  materials: Material[]
): number {
  return project.tabs.reduce((sum, tab) => {
    return sum + calculateTabBOQ(tab, allLayers, materials, project.exchangeRate || 1).grandTotalCost;
  }, 0);
}
