/**
 * DraftCraft File Format (.draftcraft)
 *
 * Structure (ZIP archive):
 *   manifest.json        - format version + project metadata
 *   project.json         - project state (tabs, preferences) with imageSrc replaced by image filenames
 *   layers.json          - all layer data
 *   materials.json       - all material definitions
 *   images/
 *     <tabId>-bg.<ext>   - original background image for each tab
 *     <tabId>-warped.<ext> - perspective-warped image for each tab (if present)
 */

import JSZip from 'jszip';
import type { ProjectState, ShapeLayer, Material } from '../store/useStore';

const FORMAT_VERSION = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a base64 data URL to a Uint8Array + mime type */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; ext: string } {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, ext };
}

/** Convert a Uint8Array back to a base64 data URL */
function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

function mimeFromExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveDraftcraft(
  project: ProjectState,
  layers: ShapeLayer[],
  materials: Material[]
): Promise<void> {
  const zip = new JSZip();
  const imagesFolder = zip.folder('images')!;

  // Strip images out of tabs, store them as separate files
  const strippedTabs = project.tabs.map(tab => {
    const tabData: any = { ...tab };

    if (tab.imageSrc) {
      const { bytes, ext } = dataUrlToBytes(tab.imageSrc);
      const filename = `${tab.id}-bg.${ext}`;
      imagesFolder.file(filename, bytes);
      tabData.imageSrc = `images/${filename}`;
    }

    if (tab.warpedImageSrc) {
      const { bytes, ext } = dataUrlToBytes(tab.warpedImageSrc);
      const filename = `${tab.id}-warped.${ext}`;
      imagesFolder.file(filename, bytes);
      tabData.warpedImageSrc = `images/${filename}`;
    }

    return tabData;
  });

  // Manifest
  zip.file('manifest.json', JSON.stringify({
    version: FORMAT_VERSION,
    appName: 'DraftCraft Studio',
    savedAt: new Date().toISOString(),
    projectName: project.name,
  }, null, 2));

  // Project (tabs stripped of image data)
  zip.file('project.json', JSON.stringify({ ...project, tabs: strippedTabs }, null, 2));

  // Layers
  zip.file('layers.json', JSON.stringify(layers, null, 2));

  // Materials
  zip.file('materials.json', JSON.stringify(materials, null, 2));

  // Generate and trigger download
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name || 'project'}.draftcraft`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Open ─────────────────────────────────────────────────────────────────────

export interface DraftcraftData {
  project: ProjectState;
  layers: ShapeLayer[];
  materials: Material[];
}

export async function openDraftcraft(file: File): Promise<DraftcraftData> {
  const zip = await JSZip.loadAsync(file);

  // Read manifest (optional — for future version migration)
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.version > FORMAT_VERSION) {
      console.warn(`DraftCraft: file version ${manifest.version} is newer than supported ${FORMAT_VERSION}`);
    }
  }

  // Read project
  const projectFile = zip.file('project.json');
  if (!projectFile) throw new Error('Invalid .draftcraft file: missing project.json');
  const project: ProjectState = JSON.parse(await projectFile.async('string'));

  // Restore images from zip back into tabs as data URLs
  project.tabs = await Promise.all(project.tabs.map(async tab => {
    const tabData: any = { ...tab };

    if (typeof tab.imageSrc === 'string' && tab.imageSrc.startsWith('images/')) {
      const imgFile = zip.file(tab.imageSrc);
      if (imgFile) {
        const bytes = await imgFile.async('uint8array');
        const ext = tab.imageSrc.split('.').pop() || 'jpg';
        tabData.imageSrc = bytesToDataUrl(bytes, mimeFromExt(ext));
      }
    }

    if (typeof tab.warpedImageSrc === 'string' && tab.warpedImageSrc.startsWith('images/')) {
      const imgFile = zip.file(tab.warpedImageSrc);
      if (imgFile) {
        const bytes = await imgFile.async('uint8array');
        const ext = tab.warpedImageSrc.split('.').pop() || 'jpg';
        tabData.warpedImageSrc = bytesToDataUrl(bytes, mimeFromExt(ext));
      }
    }

    return tabData;
  }));

  // Read layers
  const layersFile = zip.file('layers.json');
  const layers: ShapeLayer[] = layersFile ? JSON.parse(await layersFile.async('string')) : [];

  // Read materials
  const materialsFile = zip.file('materials.json');
  const materials: Material[] = materialsFile ? JSON.parse(await materialsFile.async('string')) : [];

  return { project, layers, materials };
}
