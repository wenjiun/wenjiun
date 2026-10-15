import * as THREE from 'three';

/**
 * Generates zero-dependency procedural textures for the Urban House scene
 * matching the reference screenshot (reddish-brown siding, fieldstone gable,
 * charcoal architectural roof shingles, lush grass lawn, concrete pavers,
 * dark asphalt street, and backyard swimming pool).
 */
export interface ProceduralTextureSet {
  brickSiding: THREE.CanvasTexture;
  stoneMasonry: THREE.CanvasTexture;
  roofShingles: THREE.CanvasTexture;
  grassLawn: THREE.CanvasTexture;
  concretePavers: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  poolWater: THREE.CanvasTexture;
  garagePanel: THREE.CanvasTexture;
  dispose: () => void;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy = 8): ProceduralTextureSet {
  // 1. Reddish-Brown Clapboard / Brick Siding Texture
  const sidingCanvas = document.createElement('canvas');
  sidingCanvas.width = 512;
  sidingCanvas.height = 512;
  const sCtx = sidingCanvas.getContext('2d')!;
  sCtx.fillStyle = '#7e3b2e';
  sCtx.fillRect(0, 0, 512, 512);

  const courses = 16;
  const courseH = 512 / courses;
  for (let row = 0; row < courses; row++) {
    const y = row * courseH;
    // Subtle gradient per clapboard/brick course
    const grad = sCtx.createLinearGradient(0, y, 0, y + courseH);
    grad.addColorStop(0, '#8d4335');
    grad.addColorStop(0.75, '#78362a');
    grad.addColorStop(1, '#58251c');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, y, 512, courseH - 2);

    // Subtle vertical brick/shingle joints
    const cols = 8;
    const colW = 512 / cols;
    const offset = (row % 2) * (colW / 2);
    for (let col = -1; col <= cols; col++) {
      const x = col * colW + offset;
      // Slight tone variation per brick/shingle
      const shade = ((row * 7 + col * 13) % 5) * 4 - 8;
      sCtx.fillStyle = `rgba(${135 + shade}, ${62 + shade}, ${48 + shade}, 0.35)`;
      sCtx.fillRect(x + 2, y + 1, colW - 4, courseH - 4);

      sCtx.fillStyle = 'rgba(55, 22, 16, 0.45)';
      sCtx.fillRect(x, y, 2, courseH);
    }

    // Bottom shadow line
    sCtx.fillStyle = 'rgba(35, 12, 8, 0.65)';
    sCtx.fillRect(0, y + courseH - 2, 512, 2);
  }

  // 2. Central Gable Fieldstone Masonry Texture
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 512;
  stoneCanvas.height = 512;
  const stCtx = stoneCanvas.getContext('2d')!;
  stCtx.fillStyle = '#8b8574';
  stCtx.fillRect(0, 0, 512, 512);

  const stoneColors = ['#b5ae99', '#a39c86', '#968f7b', '#c2bba6', '#8a826e'];
  const stoneRows = 12;
  const stoneRowH = 512 / stoneRows;
  for (let r = 0; r < stoneRows; r++) {
    let curX = (r % 2) * -28;
    const y = r * stoneRowH;
    while (curX < 512) {
      const w = 48 + ((r * 19 + curX * 7) % 44);
      const color = stoneColors[Math.abs(r * 11 + Math.floor(curX)) % stoneColors.length];
      stCtx.fillStyle = color;
      stCtx.fillRect(curX + 3, y + 3, w - 5, stoneRowH - 5);

      // Highlight top edge
      stCtx.fillStyle = 'rgba(255,255,255,0.16)';
      stCtx.fillRect(curX + 3, y + 3, w - 5, 3);
      // Shadow bottom edge
      stCtx.fillStyle = 'rgba(0,0,0,0.22)';
      stCtx.fillRect(curX + 3, y + stoneRowH - 5, w - 5, 3);

      curX += w;
    }
  }

  // 3. Dark Charcoal Architectural Roof Shingles
  const roofCanvas = document.createElement('canvas');
  roofCanvas.width = 512;
  roofCanvas.height = 512;
  const rCtx = roofCanvas.getContext('2d')!;
  rCtx.fillStyle = '#333638';
  rCtx.fillRect(0, 0, 512, 512);

  const shingleRows = 16;
  const sRowH = 512 / shingleRows;
  for (let r = 0; r < shingleRows; r++) {
    const y = r * sRowH;
    const cols = 8;
    const cW = 512 / cols;
    const off = (r % 2) * (cW / 2);
    for (let c = -1; c <= cols; c++) {
      const x = c * cW + off;
      const v = 46 + ((r * 13 + c * 29) % 18);
      rCtx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 4})`;
      rCtx.fillRect(x + 1, y + 1, cW - 2, sRowH - 3);
    }
    rCtx.fillStyle = 'rgba(18, 20, 22, 0.7)';
    rCtx.fillRect(0, y + sRowH - 2, 512, 2);
  }

  // 4. Lush Suburban Grass Lawn Texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gCtx = grassCanvas.getContext('2d')!;
  gCtx.fillStyle = '#5ca332';
  gCtx.fillRect(0, 0, 512, 512);

  // Subtle mowing stripes & organic blade speckle
  for (let i = 0; i < 8; i++) {
    gCtx.fillStyle = i % 2 === 0 ? 'rgba(115, 185, 65, 0.16)' : 'rgba(68, 128, 32, 0.14)';
    gCtx.fillRect(i * 64, 0, 64, 512);
  }
  for (let i = 0; i < 6000; i++) {
    const gx = (i * 73) % 512;
    const gy = (i * 137) % 512;
    gCtx.fillStyle = i % 3 === 0 ? '#6db83d' : i % 3 === 1 ? '#4e8f28' : '#7ac449';
    gCtx.fillRect(gx, gy, 2, 4);
  }

  // 5. Concrete Paver Sidewalk & Driveway Texture
  const paverCanvas = document.createElement('canvas');
  paverCanvas.width = 512;
  paverCanvas.height = 512;
  const pCtx = paverCanvas.getContext('2d')!;
  pCtx.fillStyle = '#dcdede';
  pCtx.fillRect(0, 0, 512, 512);

  const pGrid = 8;
  const pSize = 512 / pGrid;
  for (let r = 0; r < pGrid; r++) {
    for (let c = 0; c < pGrid; c++) {
      const x = c * pSize;
      const y = r * pSize;
      const tone = 216 + ((r * 7 + c * 11) % 16);
      pCtx.fillStyle = `rgb(${tone}, ${tone + 1}, ${tone + 2})`;
      pCtx.fillRect(x + 2, y + 2, pSize - 4, pSize - 4);
      pCtx.strokeStyle = 'rgba(150, 155, 160, 0.55)';
      pCtx.lineWidth = 2;
      pCtx.strokeRect(x + 1, y + 1, pSize - 2, pSize - 2);
    }
  }

  // 6. Dark Asphalt Street Texture
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const rdCtx = roadCanvas.getContext('2d')!;
  rdCtx.fillStyle = '#1b1d1f';
  rdCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const rx = (i * 97) % 512;
    const ry = (i * 193) % 512;
    const v = 22 + (i % 18);
    rdCtx.fillStyle = `rgb(${v}, ${v + 1}, ${v + 2})`;
    rdCtx.fillRect(rx, ry, 2, 2);
  }

  // 7. Pool Water Caustic Texture
  const poolCanvas = document.createElement('canvas');
  poolCanvas.width = 512;
  poolCanvas.height = 512;
  const plCtx = poolCanvas.getContext('2d')!;
  const poolGrad = plCtx.createLinearGradient(0, 0, 512, 512);
  poolGrad.addColorStop(0, '#0ea5e9');
  poolGrad.addColorStop(0.5, '#38bdf8');
  poolGrad.addColorStop(1, '#0284c7');
  plCtx.fillStyle = poolGrad;
  plCtx.fillRect(0, 0, 512, 512);

  plCtx.strokeStyle = 'rgba(224, 242, 254, 0.35)';
  plCtx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    plCtx.beginPath();
    const py = i * 32;
    plCtx.moveTo(0, py);
    for (let x = 0; x <= 512; x += 32) {
      plCtx.quadraticCurveTo(x + 16, py + ((i + x) % 2 === 0 ? 12 : -12), x + 32, py);
    }
    plCtx.stroke();
  }

  // 8. Paneled Garage Door Texture
  const garageCanvas = document.createElement('canvas');
  garageCanvas.width = 512;
  garageCanvas.height = 512;
  const grCtx = garageCanvas.getContext('2d')!;
  grCtx.fillStyle = '#d8e0d8';
  grCtx.fillRect(0, 0, 512, 512);

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = c * 128 + 14;
      const y = r * 128 + 16;
      const w = 100;
      const h = 96;
      grCtx.strokeStyle = '#9aa59c';
      grCtx.lineWidth = 4;
      grCtx.strokeRect(x, y, w, h);
      grCtx.fillStyle = r === 0 ? '#7b8c98' : '#ced7ce';
      grCtx.fillRect(x + 4, y + 4, w - 8, h - 8);
    }
  }

  const brickSiding = configureTexture(sidingCanvas, 4, 3, maxAnisotropy);
  const stoneMasonry = configureTexture(stoneCanvas, 2, 2.5, maxAnisotropy);
  const roofShingles = configureTexture(roofCanvas, 6, 4, maxAnisotropy);
  const grassLawn = configureTexture(grassCanvas, 12, 12, maxAnisotropy);
  const concretePavers = configureTexture(paverCanvas, 8, 8, maxAnisotropy);
  const asphaltRoad = configureTexture(roadCanvas, 14, 14, maxAnisotropy);
  const poolWater = configureTexture(poolCanvas, 3, 3, maxAnisotropy);
  const garagePanel = configureTexture(garageCanvas, 1, 1, maxAnisotropy);

  return {
    brickSiding,
    stoneMasonry,
    roofShingles,
    grassLawn,
    concretePavers,
    asphaltRoad,
    poolWater,
    garagePanel,
    dispose: () => {
      brickSiding.dispose();
      stoneMasonry.dispose();
      roofShingles.dispose();
      grassLawn.dispose();
      concretePavers.dispose();
      asphaltRoad.dispose();
      poolWater.dispose();
      garagePanel.dispose();
    },
  };
}
