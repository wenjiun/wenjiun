import * as THREE from 'three';
import { ProceduralTextureSet } from '../utils/proceduralTextures';

/**
 * Builds the procedural placeholder suburban house matching the user's
 * "3D Urban House" screenshot, scaled to a 40m lot width by default:
 * - Dark asphalt street in front (+Z) and right side (+X)
 * - Lush green lawn with concrete sidewalks along the front and right side
 * - Two-story reddish-brown brick/clapboard house with:
 *   - Central stone gable & arched front porch with 3 white square columns
 *   - Left high gable with double upper windows
 *   - Right wing with lower shuttered windows & upper bay window
 *   - Double paneled garage doors on the right (+X) facade with concrete driveway
 *   - Backyard swimming pool (-Z) with turquoise water, coping, and deck
 *   - Three lush deciduous trees positioned on the front-left, front-right, and back-right lawn
 */
export function buildProceduralUrbanHouse(textures: ProceduralTextureSet): THREE.Group {
  const root = new THREE.Group();
  root.name = 'ProceduralUrbanHouse';

  // Shared PBR Materials
  const sidingMat = new THREE.MeshStandardMaterial({
    map: textures.brickSiding,
    roughness: 0.78,
    metalness: 0.05,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMasonry,
    roughness: 0.85,
    metalness: 0.04,
  });

  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.roofShingles,
    roughness: 0.82,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const whiteTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf4f5f6,
    roughness: 0.42,
    metalness: 0.08,
  });

  const windowGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b4d5e,
    roughness: 0.12,
    metalness: 0.15,
    reflectivity: 0.9,
    clearcoat: 0.8,
  });

  const foundationMat = new THREE.MeshStandardMaterial({
    color: 0x7c7f82,
    roughness: 0.88,
    metalness: 0.05,
  });

  const lawnMat = new THREE.MeshStandardMaterial({
    map: textures.grassLawn,
    roughness: 0.9,
    metalness: 0.02,
  });

  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.concretePavers,
    roughness: 0.75,
    metalness: 0.04,
  });

  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltRoad,
    roughness: 0.88,
    metalness: 0.06,
  });

  const garageDoorMat = new THREE.MeshStandardMaterial({
    map: textures.garagePanel,
    roughness: 0.52,
    metalness: 0.15,
  });

  // ============================================================================
  // 1. GROUND LOT: ASPHALT ROAD, GREEN LAWN, SIDEWALKS, AND DRIVEWAY
  // ============================================================================
  // Total base width = 40m (X: -20 to +20), depth = 40m (Z: -20 to +20)
  const roadBase = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 40), roadMat);
  roadBase.position.set(0, -0.06, 0);
  roadBase.receiveShadow = true;
  roadBase.userData.walkable = true;
  root.add(roadBase);

  // Green Lawn Lot: occupies X: -18.5 to +13.5 (32m wide), Z: -18.5 to +13.5 (32m deep)
  // Leaving a wide asphalt road along the front (+Z: 13.5 to 20) and right (+X: 13.5 to 20)
  const lawnMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 0.06, 32), lawnMat);
  lawnMesh.position.set(-2.5, 0.03, -2.5);
  lawnMesh.receiveShadow = true;
  lawnMesh.userData.walkable = true;
  root.add(lawnMesh);

  // Front Sidewalk running along Z = +11.6
  const frontSidewalk = new THREE.Mesh(new THREE.BoxGeometry(31.8, 0.05, 1.5), sidewalkMat);
  frontSidewalk.position.set(-2.5, 0.075, 11.6);
  frontSidewalk.receiveShadow = true;
  frontSidewalk.userData.walkable = true;
  root.add(frontSidewalk);

  // Right-Side Boulevard Sidewalk running along X = +11.6
  const rightSidewalk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 31.8), sidewalkMat);
  rightSidewalk.position.set(11.6, 0.075, -2.5);
  rightSidewalk.receiveShadow = true;
  rightSidewalk.userData.walkable = true;
  root.add(rightSidewalk);

  // Walkway from Front Porch (X = -4.2) out to the front road curb
  const porchWalkway = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.055, 8.2), sidewalkMat);
  porchWalkway.position.set(-4.2, 0.078, 9.4);
  porchWalkway.receiveShadow = true;
  porchWalkway.userData.walkable = true;
  root.add(porchWalkway);

  // Side Driveway connecting the Right-side Garage doors (X = +3.0) out to the Right Sidewalk (X = +13.5)
  const drivewayPad = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.055, 6.4), sidewalkMat);
  drivewayPad.position.set(8.2, 0.078, 1.4);
  drivewayPad.receiveShadow = true;
  drivewayPad.userData.walkable = true;
  root.add(drivewayPad);

  // ============================================================================
  // 2. MAIN SUBURBAN HOUSE COMPOSITE ARCHITECTURE
  // ============================================================================
  const houseGroup = new THREE.Group();
  houseGroup.position.set(-2.5, 0.06, -0.5);
  root.add(houseGroup);

  // Concrete Foundation Plinth
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.35, 10.6), foundationMat);
  foundation.position.set(0, 0.175, 0);
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  foundation.userData.walkable = true;
  houseGroup.add(foundation);

  // Main Two-Story Volume (Left & Center Core)
  const mainCore = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6.4, 9.8), sidingMat);
  mainCore.position.set(-2.6, 3.55, -0.2);
  mainCore.castShadow = true;
  mainCore.receiveShadow = true;
  houseGroup.add(mainCore);

  // Right Wing Volume (Garage ground floor + Upper Bedroom)
  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(6.0, 5.8, 9.2), sidingMat);
  rightWing.position.set(4.8, 3.25, 0.2);
  rightWing.castShadow = true;
  rightWing.receiveShadow = true;
  houseGroup.add(rightWing);

  // Left Gable Forward Projection
  const leftProjection = new THREE.Mesh(new THREE.BoxGeometry(3.8, 6.4, 1.2), sidingMat);
  leftProjection.position.set(-5.2, 3.55, 4.9);
  leftProjection.castShadow = true;
  leftProjection.receiveShadow = true;
  houseGroup.add(leftProjection);

  // Center Fieldstone Projection (above front entry porch)
  const stoneProjection = new THREE.Mesh(new THREE.BoxGeometry(3.1, 6.5, 1.4), stoneMat);
  stoneProjection.position.set(-1.7, 3.6, 5.0);
  stoneProjection.castShadow = true;
  stoneProjection.receiveShadow = true;
  houseGroup.add(stoneProjection);

  // Upper Right Bay Window Projection
  const bayProjection = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 0.9), sidingMat);
  bayProjection.position.set(4.8, 4.7, 5.0);
  bayProjection.castShadow = true;
  bayProjection.receiveShadow = true;
  houseGroup.add(bayProjection);

  // Helper to create a 3D pitched gable roof prism with white rake trim
  function createGableRoof(
    width: number,
    height: number,
    depth: number,
    wallMaterial: THREE.Material,
    withWhiteRake = true
  ): THREE.Group {
    const gGroup = new THREE.Group();
    const halfW = width / 2;

    // Triangular gable wall (front & back extruded)
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-halfW + 0.15, 0);
    wallShape.lineTo(halfW - 0.15, 0);
    wallShape.lineTo(0, height - 0.1);
    wallShape.closePath();

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: depth - 0.3,
      bevelEnabled: false,
    });
    wallGeo.translate(0, 0, -(depth - 0.3) / 2);
    const gableWall = new THREE.Mesh(wallGeo, wallMaterial);
    gableWall.castShadow = true;
    gableWall.receiveShadow = true;
    gGroup.add(gableWall);

    // Left and Right sloped roof planes
    const slopeLen = Math.hypot(halfW + 0.35, height + 0.15);
    const slopeAngle = Math.atan2(height, halfW);

    const leftSlope = new THREE.Mesh(
      new THREE.BoxGeometry(slopeLen, 0.18, depth + 0.4),
      roofMat
    );
    leftSlope.position.set(-halfW / 2 - 0.08, height / 2, 0);
    leftSlope.rotation.z = slopeAngle;
    leftSlope.castShadow = true;
    leftSlope.receiveShadow = true;
    gGroup.add(leftSlope);

    const rightSlope = new THREE.Mesh(
      new THREE.BoxGeometry(slopeLen, 0.18, depth + 0.4),
      roofMat
    );
    rightSlope.position.set(halfW / 2 + 0.08, height / 2, 0);
    rightSlope.rotation.z = -slopeAngle;
    rightSlope.castShadow = true;
    rightSlope.receiveShadow = true;
    gGroup.add(rightSlope);

    if (withWhiteRake) {
      const leftTrim = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen + 0.05, 0.14, 0.12),
        whiteTrimMat
      );
      leftTrim.position.set(-halfW / 2 - 0.08, height / 2 - 0.04, depth / 2 + 0.18);
      leftTrim.rotation.z = slopeAngle;
      gGroup.add(leftTrim);

      const rightTrim = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen + 0.05, 0.14, 0.12),
        whiteTrimMat
      );
      rightTrim.position.set(halfW / 2 + 0.08, height / 2 - 0.04, depth / 2 + 0.18);
      rightTrim.rotation.z = -slopeAngle;
      gGroup.add(rightTrim);

      // Horizontal cornice returns
      const returnL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.25), whiteTrimMat);
      returnL.position.set(-halfW + 0.2, 0.05, depth / 2 + 0.1);
      gGroup.add(returnL);

      const returnR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.25), whiteTrimMat);
      returnR.position.set(halfW - 0.2, 0.05, depth / 2 + 0.1);
      gGroup.add(returnR);
    }

    return gGroup;
  }

  // Main Transverse Ridge Roof (runs along X-axis)
  const mainTransverseRoof = createGableRoof(10.2, 3.4, 15.6, sidingMat, false);
  mainTransverseRoof.rotation.y = Math.PI / 2;
  mainTransverseRoof.position.set(0.1, 6.5, -0.2);
  houseGroup.add(mainTransverseRoof);

  // Left High Front Gable (Reddish-brown siding with white trim)
  const leftGableRoof = createGableRoof(4.2, 2.6, 4.6, sidingMat, true);
  leftGableRoof.position.set(-5.2, 6.75, 3.4);
  houseGroup.add(leftGableRoof);

  // Center Stone Front Gable (Stone masonry with white trim)
  const stoneGableRoof = createGableRoof(3.4, 2.3, 4.2, stoneMat, true);
  stoneGableRoof.position.set(-1.7, 6.45, 3.8);
  houseGroup.add(stoneGableRoof);

  // Right Wing Lower Eave Roof Skirt above ground-floor windows
  const rightSkirtRoof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.2, 1.4), roofMat);
  rightSkirtRoof.position.set(4.8, 3.45, 5.1);
  rightSkirtRoof.rotation.x = 0.35;
  rightSkirtRoof.castShadow = true;
  houseGroup.add(rightSkirtRoof);

  // Upper Right Bay Window Hip Cap
  const bayCap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 4), roofMat);
  bayCap.position.set(4.8, 6.5, 4.9);
  bayCap.rotation.y = Math.PI / 4;
  bayCap.scale.set(1.05, 1, 0.55);
  bayCap.castShadow = true;
  houseGroup.add(bayCap);

  // ============================================================================
  // 3. FRONT PORCH WITH ARCHED PEDIMENT, COLUMNS & FRONT DOOR
  // ============================================================================
  const porchGroup = new THREE.Group();
  porchGroup.position.set(-3.4, 0, 6.4);
  houseGroup.add(porchGroup);

  // Walkable Porch Deck (y = 0.38m above lawn)
  const porchDeck = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.36, 2.6), foundationMat);
  porchDeck.position.set(0, 0.18, 0);
  porchDeck.receiveShadow = true;
  porchDeck.castShadow = true;
  porchDeck.userData.walkable = true;
  porchGroup.add(porchDeck);

  // Porch Top Paver Surface
  const porchTop = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.04, 2.55), sidewalkMat);
  porchTop.position.set(0, 0.38, 0);
  porchTop.receiveShadow = true;
  porchTop.userData.walkable = true;
  porchGroup.add(porchTop);

  // 2 Wide Front Steps leading onto Porch
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 0.45), sidewalkMat);
  step1.position.set(1.6, 0.09, 1.5);
  step1.receiveShadow = true;
  step1.userData.walkable = true;
  porchGroup.add(step1);

  const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 0.45), sidewalkMat);
  step2.position.set(1.6, 0.14, 1.25);
  step2.receiveShadow = true;
  step2.userData.walkable = true;
  porchGroup.add(step2);

  // 3 White Square Architectural Columns (at X = -3.1, +0.2, +3.1)
  const columnXPositions = [-3.1, 0.2, 3.1];
  for (const cx of columnXPositions) {
    const colGroup = new THREE.Group();
    colGroup.position.set(cx, 0.4, 1.05);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.65, 0.46), whiteTrimMat);
    plinth.position.y = 0.325;
    plinth.castShadow = true;
    colGroup.add(plinth);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.15, 0.32), whiteTrimMat);
    shaft.position.y = 1.4;
    shaft.castShadow = true;
    colGroup.add(shaft);

    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.44), whiteTrimMat);
    capital.position.y = 2.52;
    capital.castShadow = true;
    colGroup.add(capital);

    porchGroup.add(colGroup);
  }

  // Porch Header Beam & Roof
  const porchBeam = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.26, 2.6), whiteTrimMat);
  porchBeam.position.set(0, 3.05, 0);
  porchBeam.castShadow = true;
  porchGroup.add(porchBeam);

  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.22, 2.85), roofMat);
  porchRoof.position.set(0, 3.38, -0.05);
  porchRoof.rotation.x = 0.24;
  porchRoof.castShadow = true;
  porchGroup.add(porchRoof);

  // Signature White Arched Entry Pediment over the right pair of columns (X = 0.2 to 3.1)
  const archRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.14, 12, 32, Math.PI),
    whiteTrimMat
  );
  archRing.position.set(1.65, 2.95, 1.16);
  archRing.scale.set(1, 0.55, 0.6);
  archRing.castShadow = true;
  porchGroup.add(archRing);

  const archGable = createGableRoof(3.2, 1.25, 2.6, whiteTrimMat, true);
  archGable.position.set(1.65, 3.18, 0.05);
  porchGroup.add(archGable);

  // Front Entrance Door with Sidelights (aligned with Porch Entry at X = -1.7 in houseGroup coords)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(-1.75, 0.4, 5.72);
  houseGroup.add(doorGroup);

  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.55, 0.14), whiteTrimMat);
  doorFrame.position.y = 1.275;
  doorGroup.add(doorFrame);

  const mainDoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 2.35, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xd8dee3, roughness: 0.35 })
  );
  mainDoorPanel.position.set(0, 1.2, 0.02);
  doorGroup.add(mainDoorPanel);

  // Brass Door Handle at realistic 1.05m above porch floor
  const doorHandle = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 })
  );
  doorHandle.position.set(0.38, 1.05, 0.14);
  doorGroup.add(doorHandle);

  // Sidelights
  const leftSidelight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.16), windowGlassMat);
  leftSidelight.position.set(-0.75, 1.2, 0.01);
  doorGroup.add(leftSidelight);

  const rightSidelight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.16), windowGlassMat);
  rightSidelight.position.set(0.75, 1.2, 0.01);
  doorGroup.add(rightSidelight);

  // ============================================================================
  // 4. ARCHITECTURAL WINDOWS WITH WHITE MUNTINS & SHUTTERS
  // ============================================================================
  function createWindow(
    width: number,
    height: number,
    withShutters = true,
    cols = 3,
    rows = 4
  ): THREE.Group {
    const wGroup = new THREE.Group();

    // Outer white frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.14), whiteTrimMat);
    wGroup.add(frame);

    // Recessed reflective glass pane
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.16, height - 0.16, 0.16),
      windowGlassMat
    );
    wGroup.add(glass);

    // Muntin grid bars
    for (let c = 1; c < cols; c++) {
      const mx = -width / 2 + (width / cols) * c;
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.035, height - 0.14, 0.18), whiteTrimMat);
      vBar.position.x = mx;
      wGroup.add(vBar);
    }
    for (let r = 1; r < rows; r++) {
      const my = -height / 2 + (height / rows) * r;
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(width - 0.14, 0.035, 0.18), whiteTrimMat);
      hBar.position.y = my;
      wGroup.add(hBar);
    }

    // Window sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.09, 0.22), whiteTrimMat);
    sill.position.set(0, -height / 2 - 0.03, 0.03);
    wGroup.add(sill);

    if (withShutters) {
      const shutterW = 0.34;
      const leftShutter = new THREE.Mesh(
        new THREE.BoxGeometry(shutterW, height - 0.04, 0.08),
        whiteTrimMat
      );
      leftShutter.position.set(-width / 2 - shutterW / 2 - 0.04, 0, 0.02);
      wGroup.add(leftShutter);

      const rightShutter = new THREE.Mesh(
        new THREE.BoxGeometry(shutterW, height - 0.04, 0.08),
        whiteTrimMat
      );
      rightShutter.position.set(width / 2 + shutterW / 2 + 0.04, 0, 0.02);
      wGroup.add(rightShutter);
    }

    return wGroup;
  }

  // Front Left Ground Floor Windows (under porch)
  const winPorchL = createWindow(1.15, 1.85, true);
  winPorchL.position.set(-5.9, 1.8, 5.52);
  houseGroup.add(winPorchL);

  const winPorchM = createWindow(1.15, 1.85, true);
  winPorchM.position.set(-3.9, 1.8, 5.52);
  houseGroup.add(winPorchM);

  // Front Left Upper Double Windows
  const winUpperL1 = createWindow(0.85, 1.35, true, 2, 3);
  winUpperL1.position.set(-5.95, 4.9, 5.52);
  houseGroup.add(winUpperL1);

  const winUpperL2 = createWindow(0.85, 1.35, true, 2, 3);
  winUpperL2.position.set(-4.35, 4.9, 5.52);
  houseGroup.add(winUpperL2);

  // Center Stone Gable Upper Window
  const winStoneUpper = createWindow(1.45, 1.35, false, 4, 3);
  winStoneUpper.position.set(-1.7, 4.85, 5.72);
  houseGroup.add(winStoneUpper);

  // Middle Recessed Windows (between Stone Gable and Right Wing)
  const winMidLower = createWindow(1.05, 1.8, true);
  winMidLower.position.set(0.8, 1.8, 4.72);
  houseGroup.add(winMidLower);

  const winMidUpper = createWindow(1.05, 1.45, true);
  winMidUpper.position.set(0.8, 4.8, 4.72);
  houseGroup.add(winMidUpper);

  // Right Wing Lower Shuttered Windows (2 large windows matching screenshot)
  const winRightLower1 = createWindow(1.25, 1.95, true);
  winRightLower1.position.set(3.4, 1.8, 4.82);
  houseGroup.add(winRightLower1);

  const winRightLower2 = createWindow(1.25, 1.95, true);
  winRightLower2.position.set(6.1, 1.8, 4.82);
  houseGroup.add(winRightLower2);

  // Right Wing Upper Bay Window (triple-pane unit)
  const winRightBay = createWindow(2.2, 1.55, false, 5, 3);
  winRightBay.position.set(4.8, 4.75, 5.47);
  houseGroup.add(winRightBay);

  // ============================================================================
  // 5. DOUBLE PANELED GARAGE DOORS ON RIGHT (+X) FACADE
  // ============================================================================
  for (const gz of [2.9, -0.3]) {
    const gDoorGroup = new THREE.Group();
    gDoorGroup.position.set(7.82, 1.45, gz);
    gDoorGroup.rotation.y = Math.PI / 2;

    const gFrame = new THREE.Mesh(new THREE.BoxGeometry(2.65, 2.35, 0.12), whiteTrimMat);
    gDoorGroup.add(gFrame);

    const gPanel = new THREE.Mesh(new THREE.BoxGeometry(2.48, 2.22, 0.16), garageDoorMat);
    gDoorGroup.add(gPanel);

    houseGroup.add(gDoorGroup);
  }

  // ============================================================================
  // 6. BACKYARD SWIMMING POOL & SUN DECK (-Z)
  // ============================================================================
  const poolGroup = new THREE.Group();
  poolGroup.position.set(0.5, 0.06, -11.2);
  root.add(poolGroup);

  // Stone Pool Patio Deck
  const poolDeck = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.06, 9.2), sidewalkMat);
  poolDeck.position.set(0, 0.03, 0);
  poolDeck.receiveShadow = true;
  poolDeck.userData.walkable = true;
  poolGroup.add(poolDeck);

  // White Travertine Pool Coping Border
  const poolCoping = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.11, 5.4), whiteTrimMat);
  poolCoping.position.set(0, 0.055, 0);
  poolCoping.receiveShadow = true;
  poolCoping.userData.walkable = true;
  poolGroup.add(poolCoping);

  // Glowing Turquoise Pool Water Surface
  const waterMat = new THREE.MeshPhysicalMaterial({
    map: textures.poolWater,
    color: 0x38bdf8,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    emissive: new THREE.Color(0x0284c7),
    emissiveIntensity: 0.18,
  });
  const poolWaterMesh = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.13, 4.7), waterMat);
  poolWaterMesh.position.set(0, 0.06, 0);
  poolWaterMesh.userData.walkable = true;
  poolGroup.add(poolWaterMesh);

  // 2 Poolside Lounge Chairs
  for (const lx of [-5.8, -5.8]) {
    for (const lz of [-1.4, 1.4]) {
      const lounger = new THREE.Group();
      lounger.position.set(lx, 0.06, lz);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.25, 0.75), whiteTrimMat);
      base.position.y = 0.18;
      base.castShadow = true;
      lounger.add(base);
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.72), whiteTrimMat);
      backrest.position.set(-0.65, 0.45, 0);
      backrest.rotation.z = -0.52;
      backrest.castShadow = true;
      lounger.add(backrest);
      poolGroup.add(lounger);
    }
  }

  // ============================================================================
  // 7. COMPOSITE DECIDUOUS TREES MATCHING SCREENSHOT PLACEMENT
  // ============================================================================
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x4a3728,
    roughness: 0.92,
    metalness: 0.02,
  });

  const foliageShades = [0x4c7c29, 0x5c8f32, 0x3e6b1f, 0x6a9e3b];
  const foliageMats = foliageShades.map(
    (col) =>
      new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.82,
        metalness: 0.02,
        flatShading: true,
      })
  );

  function createDeciduousTree(heightScale: number, seed: number): THREE.Group {
    const tree = new THREE.Group();

    // Tapered Trunk
    const trunkH = 3.2 * heightScale;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * heightScale, 0.26 * heightScale, trunkH, 10),
      barkMat
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // Secondary Forked Branches
    for (let b = 0; b < 3; b++) {
      const angle = (b * Math.PI * 2) / 3 + seed;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * heightScale, 0.11 * heightScale, 1.8 * heightScale, 7),
        barkMat
      );
      branch.position.set(
        Math.cos(angle) * 0.45 * heightScale,
        trunkH * 0.85,
        Math.sin(angle) * 0.45 * heightScale
      );
      branch.rotation.z = Math.cos(angle) * 0.48;
      branch.rotation.x = Math.sin(angle) * 0.48;
      branch.castShadow = true;
      tree.add(branch);
    }

    // Multi-Part Layered Foliage Canopy (11 organic dodecahedron clusters)
    const clusterOffsets = [
      [0, 4.4, 0, 1.95],
      [-0.95, 3.8, 0.7, 1.45],
      [1.0, 3.9, 0.65, 1.5],
      [0.1, 3.7, -1.05, 1.5],
      [-0.85, 4.7, -0.65, 1.4],
      [0.85, 4.8, -0.55, 1.38],
      [0, 5.65, 0.1, 1.55],
      [-0.6, 5.2, 0.65, 1.25],
      [0.65, 5.15, 0.6, 1.25],
      [-1.2, 3.2, -0.1, 1.2],
      [1.15, 3.25, -0.2, 1.2],
    ];

    clusterOffsets.forEach(([ox, oy, oz, rad], idx) => {
      const mat = foliageMats[(idx + seed) % foliageMats.length];
      const cluster = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rad * heightScale, 1),
        mat
      );
      cluster.position.set(ox * heightScale, oy * heightScale, oz * heightScale);
      cluster.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
      cluster.scale.set(1, 1.12, 0.96);
      cluster.castShadow = true;
      cluster.receiveShadow = true;
      tree.add(cluster);
    });

    return tree;
  }

  // Tree 1: Front-Left smaller ornamental tree (X = -12.6, Z = 5.4)
  const treeFrontLeft = createDeciduousTree(1.05, 1);
  treeFrontLeft.position.set(-12.6, 0.06, 5.4);
  root.add(treeFrontLeft);

  // Tree 2: Front-Right tall hero tree near sidewalk/driveway (X = 5.8, Z = 8.4)
  const treeFrontRight = createDeciduousTree(1.85, 2);
  treeFrontRight.position.set(5.8, 0.06, 8.4);
  root.add(treeFrontRight);

  // Tree 3: Back-Right tall tree behind the driveway (X = 8.4, Z = -4.8)
  const treeBackRight = createDeciduousTree(1.65, 3);
  treeBackRight.position.set(8.4, 0.06, -4.8);
  root.add(treeBackRight);

  return root;
}
