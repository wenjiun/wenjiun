import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Upload,
  Link2,
  RotateCcw,
  Compass,
  Move,
  Eye,
  Maximize2,
  Minimize2,
  Navigation,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Footprints,
  MousePointerClick,
  Sliders,
  Sun,
  RotateCw,
  Orbit,
} from 'lucide-react';
import { createProceduralTextures } from './utils/proceduralTextures';
import { buildProceduralUrbanHouse } from './scene/ProceduralUrbanHouse';

interface ModelMetrics {
  name: string;
  isCustomGlb: boolean;
  widthMeters: number;
  heightMeters: number;
  depthMeters: number;
  meshCount: number;
  textureCount: number;
  triangleCount: number;
}

interface ViewpointPreset {
  id: string;
  label: string;
  mode: 'walk' | 'orbit';
  // Relative ratios of lotWidth / lotDepth so viewpoints adapt to any model proportions
  pos: [number, number, number];
  lookAt: [number, number, number];
}

const VIEWPOINT_PRESETS: ViewpointPreset[] = [
  {
    id: 'reference-overview',
    label: '3D Overview (Orbit)',
    mode: 'orbit',
    pos: [18.5, 6.2, 26.5],
    lookAt: [-1.0, 2.6, 0.0],
  },
  {
    id: 'front-street',
    label: 'Front Street',
    mode: 'walk',
    pos: [-3.5, 0.08, 18.5],
    lookAt: [-2.5, 2.2, 0.0],
  },
  {
    id: 'front-porch',
    label: 'Front Porch',
    mode: 'walk',
    pos: [-3.5, 0.45, 7.4],
    lookAt: [-3.5, 1.8, 0.0],
  },
  {
    id: 'driveway',
    label: 'Driveway',
    mode: 'walk',
    pos: [10.5, 0.08, 3.8],
    lookAt: [0.0, 2.0, 1.2],
  },
  {
    id: 'backyard-pool',
    label: 'Backyard Pool',
    mode: 'walk',
    pos: [-6.5, 0.12, -13.5],
    lookAt: [0.0, 1.8, -4.0],
  },
];

/**
 * Custom GLTFLoader extension plugin that automatically converts legacy
 * `KHR_materials_pbrSpecularGlossiness` materials (used by Sketchfab's
 * "3D Urban House" and many architectural GLB exports) and `EXT_texture_webp`
 * into standard Three.js PBR `pbrMetallicRoughness` materials so diffuse
 * textures, foliage alpha cutouts, and colors never fall back to blown-out white.
 */
function registerArchitecturalGlbCompatibilityPlugin(loader: GLTFLoader) {
  loader.register((parser: GLTFParser) => {
    const patchJson = () => {
      const json = parser.json as Record<string, any>;
      if (!json) return;

      // 1. Patch WebP or DDS texture source references if stored inside extensions
      if (Array.isArray(json.textures)) {
        for (const texDef of json.textures) {
          if (texDef.source === undefined && texDef.extensions) {
            if (texDef.extensions.EXT_texture_webp?.source !== undefined) {
              texDef.source = texDef.extensions.EXT_texture_webp.source;
            }
          }
        }
      }

      // 2. Patch materials: convert KHR_materials_pbrSpecularGlossiness -> pbrMetallicRoughness
      if (Array.isArray(json.materials)) {
        for (const matDef of json.materials) {
          if (!matDef.pbrMetallicRoughness) {
            matDef.pbrMetallicRoughness = {};
          }
          const pbr = matDef.pbrMetallicRoughness;
          const sg = matDef.extensions?.KHR_materials_pbrSpecularGlossiness;

          if (sg) {
            if (sg.diffuseTexture && !pbr.baseColorTexture) {
              pbr.baseColorTexture = sg.diffuseTexture;
            }
            if (Array.isArray(sg.diffuseFactor) && !pbr.baseColorFactor) {
              pbr.baseColorFactor = sg.diffuseFactor;
            }
            const gloss =
              typeof sg.glossinessFactor === 'number' ? sg.glossinessFactor : 0.35;
            pbr.roughnessFactor = Math.min(0.95, Math.max(0.25, 1.0 - gloss * 0.65));
            pbr.metallicFactor = 0.02;
            delete matDef.extensions.KHR_materials_pbrSpecularGlossiness;
          } else {
            // Prevent omitted metallicFactor from defaulting to 1.0 (chrome/white burnout)
            if (pbr.metallicFactor === undefined && !pbr.metallicRoughnessTexture) {
              pbr.metallicFactor = 0.03;
            }
            if (pbr.roughnessFactor === undefined && !pbr.metallicRoughnessTexture) {
              pbr.roughnessFactor = 0.78;
            }
          }

          // Clear bogus white emissiveFactor exported by OBJ/FBX-to-GLTF converters
          // when no emissiveTexture is present
          if (Array.isArray(matDef.emissiveFactor) && !matDef.emissiveTexture) {
            const [er, eg, eb] = matDef.emissiveFactor;
            if (er > 0.05 || eg > 0.05 || eb > 0.05) {
              matDef.emissiveFactor = [0, 0, 0];
            }
          }
        }
      }
    };

    // Patch immediately and also on beforeRoot
    patchJson();
    return {
      name: 'KHR_materials_pbrSpecularGlossiness_ArchVizCompat',
      beforeRoot: async () => {
        patchJson();
      },
    };
  });
}

// Pre-allocated math helpers at module scope to prevent per-frame GC allocations
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _worldNormal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _downRayOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);
const _cameraWorldQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const vrButtonMountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // UI State
  const [lotWidth, setLotWidth] = useState<number>(40);
  const [floorYOffset, setFloorYOffset] = useState<number>(0);
  const [modelRotationDeg, setModelRotationDeg] = useState<number>(0);
  const [exposure, setExposure] = useState<number>(0.95);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'walk'>('orbit');
  const [glbUrlInput, setGlbUrlInput] = useState<string>('./urban_house.glb');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  }>({
    type: 'info',
    text: 'Procedural 3D Urban House active (1 unit = 1m). Upload or drop your urban_house.glb to inspect.',
  });
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
  const [activeViewpoint, setActiveViewpoint] = useState<string>('reference-overview');
  const [playerCoords, setPlayerCoords] = useState<{ x: number; y: number; z: number }>({
    x: 18.5,
    y: 6.2,
    z: 26.5,
  });
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics>({
    name: 'Procedural Urban House (Reference Lot)',
    isCustomGlb: false,
    widthMeters: 40.0,
    heightMeters: 10.4,
    depthMeters: 40.0,
    meshCount: 68,
    textureCount: 8,
    triangleCount: 4820,
  });

  // Mutable Scene Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const dollyRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const activeModelRef = useRef<THREE.Object3D | null>(null);
  const proceduralModelRef = useRef<THREE.Group | null>(null);
  const walkableMeshesRef = useRef<THREE.Mesh[]>([]);
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Unscaled bounding box metrics of active model for exact real-world rescaling
  const rawBoundsRef = useRef<{
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    centerX: number;
    centerZ: number;
    minY: number;
  }>({
    sizeX: 40,
    sizeY: 10.4,
    sizeZ: 40,
    centerX: 0,
    centerZ: 0,
    minY: -0.12,
  });

  // Camera & Locomotion Mutable State
  const cameraModeRef = useRef<'orbit' | 'walk'>('orbit');
  const targetLookRef = useRef<{ yaw: number; pitch: number }>({
    yaw: 0,
    pitch: 0,
  });
  const currentLookRef = useRef<{ yaw: number; pitch: number }>({
    yaw: 0,
    pitch: 0,
  });
  const targetDollyPosRef = useRef<THREE.Vector3 | null>(null);
  const lotWidthRef = useRef<number>(40);
  const floorYOffsetRef = useRef<number>(0);
  const modelRotationDegRef = useRef<number>(0);

  /**
   * Raycasts downward at (x, z) against walkable meshes to find exact floor/porch height
   */
  const findSurfaceYAt = useCallback((x: number, z: number, fallbackY: number): number => {
    const meshes = walkableMeshesRef.current;
    if (meshes.length === 0) return fallbackY;

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(x, 30 + floorYOffsetRef.current, z),
      new THREE.Vector3(0, -1, 0),
      0.1,
      80
    );
    const hits = raycaster.intersectObjects(meshes, true);
    for (const hit of hits) {
      // Pick the first ground/porch surface below typical roof height (< 3.5m above yOffset)
      if (hit.point.y <= 3.2 + floorYOffsetRef.current) {
        return hit.point.y;
      }
    }
    return fallbackY;
  }, []);

  /**
   * Normalizes materials on any loaded GLB so textures, foliage alpha cutouts,
   * and PBR roughness/metalness render with true colors instead of washed-out white.
   */
  const sanitizeLoadedModelMaterials = useCallback((model: THREE.Object3D) => {
    const renderer = rendererRef.current;
    const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
    const uniqueTextures = new Set<THREE.Texture>();

    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      // Ensure geometry has valid vertex normals for shading
      if (mesh.geometry && !mesh.geometry.attributes.normal) {
        mesh.geometry.computeVertexNormals();
      }

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat: any) => {
        if (!mat) return;

        // 1. Prevent bogus white emissive color from blowing out textures
        if (mat.emissive && !mat.emissiveMap) {
          if (mat.emissive.r > 0.02 || mat.emissive.g > 0.02 || mat.emissive.b > 0.02) {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }

        // 2. Fix default metalness=1.0 on non-metallic architectural meshes
        if (typeof mat.metalness === 'number' && !mat.metalnessMap) {
          if (mat.metalness > 0.35) {
            mat.metalness = 0.04;
          }
        }
        if (typeof mat.roughness === 'number' && !mat.roughnessMap) {
          if (mat.roughness < 0.15 || mat.roughness === 1.0) {
            mat.roughness = 0.72;
          }
        }

        // 3. Moderate environment map intensity so daylight + envMap don't overexpose
        if ('envMapIntensity' in mat) {
          mat.envMapIntensity = 0.35;
        }

        // 4. Configure diffuse / baseColor texture & foliage alpha cutouts
        if (mat.map) {
          uniqueTextures.add(mat.map);
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = maxAniso;
          mat.map.needsUpdate = true;

          // Ensure base color doesn't tint texture dark or overly bright
          if (mat.color) {
            const lum = mat.color.r + mat.color.g + mat.color.b;
            if (lum === 0) {
              mat.color.setHex(0xffffff);
            }
          }

          // Detect foliage / tree leaf / fence alpha cutouts
          const matName = (mat.name || '').toLowerCase();
          const meshName = (mesh.name || '').toLowerCase();
          const isFoliageOrCutout =
            mat.transparent ||
            mat.alphaTest > 0 ||
            /leaf|leaves|tree|foliage|plant|bush|hedge|branch|bark|grass|alpha|fence|net/i.test(
              `${matName} ${meshName}`
            );

          if (isFoliageOrCutout) {
            mat.alphaTest = Math.max(mat.alphaTest || 0, 0.35);
            mat.side = THREE.DoubleSide;
            // Use alphaTest with depthWrite=true so tree leaves cast crisp shadows and sort cleanly
            mat.depthWrite = true;
          }
        }

        if (mat.normalMap) uniqueTextures.add(mat.normalMap);
        if (mat.roughnessMap) uniqueTextures.add(mat.roughnessMap);
        if (mat.metalnessMap) uniqueTextures.add(mat.metalnessMap);

        mat.needsUpdate = true;
      });
    });

    return uniqueTextures.size;
  }, []);

  /**
   * Computes raw unscaled bounding box of `model`, registers all meshes for shadow
   * casting/receiving and VR teleportation raycasting, and applies real-world scale.
   */
  const setupAndAlignModel = useCallback(
    (
      model: THREE.Object3D,
      name: string,
      isCustomGlb: boolean,
      targetWidth: number,
      targetYOffset: number,
      rotationDeg: number
    ) => {
      // Reset transform to measure true unscaled geometry bounds at current Y rotation
      model.position.set(0, 0, 0);
      model.rotation.set(0, THREE.MathUtils.degToRad(rotationDeg), 0);
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true);

      const textureCount = isCustomGlb ? sanitizeLoadedModelMaterials(model) : 8;

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const safeSizeX = size.x > 0.0001 ? size.x : 1;
      rawBoundsRef.current = {
        sizeX: safeSizeX,
        sizeY: size.y,
        sizeZ: size.z,
        centerX: center.x,
        centerZ: center.z,
        minY: box.min.y,
      };

      // Traverse meshes: enable shadows and register walkable surfaces
      const walkables: THREE.Mesh[] = [];
      let meshCount = 0;
      let triangleCount = 0;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          walkables.push(mesh);
          meshCount++;

          const geo = mesh.geometry;
          if (geo) {
            if (geo.index) {
              triangleCount += Math.floor(geo.index.count / 3);
            } else if (geo.attributes.position) {
              triangleCount += Math.floor(geo.attributes.position.count / 3);
            }
          }
        }
      });

      walkableMeshesRef.current = walkables;

      // Apply target Lot Width & Floor Y-Offset
      const scaleFactor = targetWidth / safeSizeX;
      model.scale.setScalar(scaleFactor);
      model.position.set(
        -center.x * scaleFactor,
        -box.min.y * scaleFactor + targetYOffset,
        -center.z * scaleFactor
      );
      model.updateMatrixWorld(true);

      const scaledW = Number((safeSizeX * scaleFactor).toFixed(2));
      const scaledH = Number((size.y * scaleFactor).toFixed(2));
      const scaledD = Number((size.z * scaleFactor).toFixed(2));

      setModelMetrics({
        name,
        isCustomGlb,
        widthMeters: scaledW,
        heightMeters: scaledH,
        depthMeters: scaledD,
        meshCount,
        textureCount,
        triangleCount,
      });

      // Update directional light shadow frustum to encompass scaled lot
      if (sunLightRef.current) {
        const maxExtent = Math.max(scaledW, scaledD) * 0.75;
        const cam = sunLightRef.current.shadow.camera;
        cam.left = -maxExtent;
        cam.right = maxExtent;
        cam.top = maxExtent;
        cam.bottom = -maxExtent;
        cam.updateProjectionMatrix();
      }
    },
    [sanitizeLoadedModelMaterials]
  );

  /**
   * Re-applies Lot Width (10m - 100m), Floor Y-Offset (-5m to +5m), and Model Y Rotation
   */
  const updateModelScaleAndOffset = useCallback(
    (newWidth: number, newYOffset: number, newRotDeg: number) => {
      const model = activeModelRef.current;
      if (!model) return;

      // If rotation changed, recompute unscaled bounding box at that rotation
      model.position.set(0, 0, 0);
      model.rotation.set(0, THREE.MathUtils.degToRad(newRotDeg), 0);
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const safeSizeX = size.x > 0.0001 ? size.x : 1;
      rawBoundsRef.current = {
        sizeX: safeSizeX,
        sizeY: size.y,
        sizeZ: size.z,
        centerX: center.x,
        centerZ: center.z,
        minY: box.min.y,
      };

      const scaleFactor = newWidth / safeSizeX;
      model.scale.setScalar(scaleFactor);
      model.position.set(
        -center.x * scaleFactor,
        -box.min.y * scaleFactor + newYOffset,
        -center.z * scaleFactor
      );
      model.updateMatrixWorld(true);

      setModelMetrics((prev) => ({
        ...prev,
        widthMeters: Number((safeSizeX * scaleFactor).toFixed(2)),
        heightMeters: Number((size.y * scaleFactor).toFixed(2)),
        depthMeters: Number((size.z * scaleFactor).toFixed(2)),
      }));
    },
    []
  );

  /**
   * Moves the camera (either Orbit overview or 1.6m Walk Dolly) to a preset viewpoint
   */
  const jumpToViewpoint = useCallback(
    (preset: ViewpointPreset) => {
      setActiveViewpoint(preset.id);
      setCameraMode(preset.mode);
      cameraModeRef.current = preset.mode;

      const scaleRatio = lotWidthRef.current / 40;
      const px = preset.pos[0] * scaleRatio;
      const pz = preset.pos[2] * scaleRatio;
      const lx = preset.lookAt[0] * scaleRatio;
      const ly = preset.lookAt[1] * scaleRatio + floorYOffsetRef.current;
      const lz = preset.lookAt[2] * scaleRatio;

      if (preset.mode === 'orbit') {
        const orbitCam = orbitCameraRef.current;
        const orbitControls = orbitControlsRef.current;
        if (orbitCam && orbitControls) {
          orbitControls.enabled = true;
          orbitCam.position.set(px, preset.pos[1] * scaleRatio + floorYOffsetRef.current, pz);
          orbitControls.target.set(lx, ly, lz);
          orbitControls.update();
          setPlayerCoords({
            x: Number(orbitCam.position.x.toFixed(1)),
            y: Number(orbitCam.position.y.toFixed(2)),
            z: Number(orbitCam.position.z.toFixed(1)),
          });
        }
      } else {
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = false;
        }
        const surfaceY = findSurfaceYAt(px, pz, preset.pos[1] + floorYOffsetRef.current);
        targetDollyPosRef.current = new THREE.Vector3(px, surfaceY, pz);

        // Compute yaw & pitch to face lookAt point from (px, surfaceY + 1.6, pz)
        const dx = lx - px;
        const dy = ly - (surfaceY + 1.6);
        const dz = lz - pz;
        const horizDist = Math.hypot(dx, dz);
        // Since camera looks along -Z at yaw=0, yaw = atan2(-dx, -dz)
        targetLookRef.current.yaw = Math.atan2(-dx, -dz);
        targetLookRef.current.pitch = THREE.MathUtils.clamp(
          Math.atan2(dy, Math.max(0.1, horizDist)),
          -Math.PI / 3,
          Math.PI / 3
        );
      }
    },
    [findSurfaceYAt]
  );

  /**
   * Loads a GLB/GLTF model from either a Blob ObjectURL or remote/local URL
   */
  const loadGlbFromUrl = useCallback(
    (url: string, displayName: string, isSilentStartupCheck = false) => {
      const loader = gltfLoaderRef.current;
      const scene = sceneRef.current;
      if (!loader || !scene) return;

      if (!isSilentStartupCheck) {
        setIsLoading(true);
        setLoadingProgress(0);
        setStatusMessage({
          type: 'info',
          text: `Loading ${displayName}...`,
        });
      }

      loader.load(
        url,
        (gltf) => {
          if (activeModelRef.current) {
            scene.remove(activeModelRef.current);
          }

          const loadedScene = gltf.scene;
          loadedScene.name = displayName;
          scene.add(loadedScene);
          activeModelRef.current = loadedScene;

          setupAndAlignModel(
            loadedScene,
            displayName,
            true,
            lotWidthRef.current,
            floorYOffsetRef.current,
            modelRotationDegRef.current
          );

          // Automatically frame the loaded GLB in 3D Overview (matching Screenshot 1)
          // so the user immediately sees the entire textured house & lot clearly
          jumpToViewpoint(VIEWPOINT_PRESETS[0]);

          setIsLoading(false);
          setLoadingProgress(100);
          setStatusMessage({
            type: 'success',
            text: `Loaded "${displayName}" — scaled to ${lotWidthRef.current}m lot width, floor aligned to y = 0.`,
          });
        },
        (progressEvent) => {
          if (progressEvent.lengthComputable && progressEvent.total > 0) {
            setLoadingProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        },
        (err) => {
          setIsLoading(false);
          if (!isSilentStartupCheck) {
            console.warn('GLB Load error:', err);
            setStatusMessage({
              type: 'error',
              text: `Could not load "${displayName}". Verify the file or URL is a valid .glb/.gltf model.`,
            });
          }
        }
      );
    },
    [setupAndAlignModel, jumpToViewpoint]
  );

  /**
   * Handles uploading a local .glb / .gltf File via button or drag-and-drop
   */
  const handleLocalFile = useCallback(
    (file: File) => {
      if (!file) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
        setStatusMessage({
          type: 'error',
          text: 'Please select a valid .glb or .gltf 3D model file.',
        });
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const blobUrl = URL.createObjectURL(file);
      objectUrlRef.current = blobUrl;
      loadGlbFromUrl(blobUrl, file.name, false);
    },
    [loadGlbFromUrl]
  );

  /**
   * Restores the built-in procedural suburban house matching the screenshot
   */
  const restoreProceduralHouse = useCallback(() => {
    const scene = sceneRef.current;
    const procModel = proceduralModelRef.current;
    if (!scene || !procModel) return;

    if (activeModelRef.current) {
      scene.remove(activeModelRef.current);
    }

    scene.add(procModel);
    activeModelRef.current = procModel;

    setupAndAlignModel(
      procModel,
      'Procedural Urban House (Reference Lot)',
      false,
      lotWidthRef.current,
      floorYOffsetRef.current,
      modelRotationDegRef.current
    );

    jumpToViewpoint(VIEWPOINT_PRESETS[0]);

    setStatusMessage({
      type: 'info',
      text: 'Restored procedural Urban House lot.',
    });
  }, [setupAndAlignModel, jumpToViewpoint]);

  // Initialize Three.js WebGL + WebXR Scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    // 1. Scene & Studio Slate Backdrop matching Screenshot 1
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x878f99);
    sceneRef.current = scene;

    // 2. Renderer with WebXR enabled & NeutralToneMapping (prevents highlight whiteout)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Mount Three.js VRButton into our dedicated DOM container
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.position = 'static';
    vrBtn.style.width = 'auto';
    vrBtn.style.padding = '8px 16px';
    vrBtn.style.borderRadius = '8px';
    vrBtn.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    vrBtn.style.fontSize = '12px';
    vrBtn.style.fontWeight = '600';
    vrBtn.style.letterSpacing = '0.02em';
    vrBtn.style.background = 'rgba(245, 158, 11, 0.95)';
    vrBtn.style.color = '#0a0a0a';
    vrBtn.style.border = '1px solid rgba(254, 243, 199, 0.5)';
    vrBtn.style.opacity = '1';
    if (vrButtonMountRef.current) {
      vrButtonMountRef.current.innerHTML = '';
      vrButtonMountRef.current.appendChild(vrBtn);
    }

    // 3. Calibrated Studio Environment Reflections (PMREM RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    if ('environmentIntensity' in scene) {
      (scene as any).environmentIntensity = 0.35;
    }
    pmremGenerator.dispose();

    // 4. Calibrated Architectural Daylight Rig (no overexposure)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556052, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.3);
    sunLight.position.set(28, 42, 32);
    sunLight.castShadow = !isHeadless;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = 32;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 140;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.32);
    fillLight.position.set(-28, 20, -24);
    scene.add(fillLight);

    // 5. Camera Dolly at y = 0 with Walk/VR Camera at y = 1.6m (Human Eye Height)
    const dolly = new THREE.Group();
    dolly.name = 'PlayerCameraDolly';
    dolly.position.set(-3.5, 0.08, 18.5);
    scene.add(dolly);
    dollyRef.current = dolly;

    const walkCamera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    walkCamera.position.set(0, 1.6, 0);
    walkCamera.rotation.order = 'YXZ';
    dolly.add(walkCamera);
    cameraRef.current = walkCamera;

    // Dedicated Orbit Camera for 3D Overview Mode (matches Screenshot 1 angle)
    const orbitCamera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    orbitCamera.position.set(18.5, 6.2, 26.5);
    orbitCameraRef.current = orbitCamera;

    const orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.07;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.01;
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 180;
    orbitControls.target.set(-1.0, 2.6, 0.0);
    orbitControls.update();
    orbitControlsRef.current = orbitControls;

    // Adjust camera local Y when entering/exiting WebXR local-floor session
    const onSessionStart = () => {
      walkCamera.position.y = 0;
    };
    const onSessionEnd = () => {
      walkCamera.position.y = 1.6;
    };
    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);

    // 6. Glowing Teleport Ring Reticle (visible during VR trigger aim or Desktop teleport)
    const reticleGroup = new THREE.Group();
    reticleGroup.visible = false;
    scene.add(reticleGroup);

    const outerRingGeo = new THREE.RingGeometry(0.32, 0.44, 40);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    reticleGroup.add(new THREE.Mesh(outerRingGeo, outerRingMat));

    const innerDiscGeo = new THREE.CircleGeometry(0.22, 32);
    innerDiscGeo.rotateX(-Math.PI / 2);
    const innerDiscMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    reticleGroup.add(new THREE.Mesh(innerDiscGeo, innerDiscMat));

    const beaconGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.65, 32, 1, true);
    beaconGeo.translate(0, 0.325, 0);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    reticleGroup.add(new THREE.Mesh(beaconGeo, beaconMat));

    // 7. Two WebXR Controllers with Visible Laser Rays & Controller Models
    const controllerModelFactory = new XRControllerModelFactory();
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0.05;
    raycaster.far = 100;

    interface XRControllerEntry {
      controller: THREE.XRTargetRaySpace;
      laserLine: THREE.Line;
      isSelecting: boolean;
    }

    const controllers: XRControllerEntry[] = [];
    let validTeleportHit: THREE.Vector3 | null = null;
    let activeAimingController: THREE.XRTargetRaySpace | null = null;

    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);

    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const laserMat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x38bdf8 : 0xf59e0b,
        transparent: true,
        opacity: 0.85,
      });
      const laserLine = new THREE.Line(laserGeo, laserMat);
      laserLine.name = 'ControllerLaserRay';
      laserLine.scale.z = 12;
      controller.add(laserLine);

      const entry: XRControllerEntry = {
        controller,
        laserLine,
        isSelecting: false,
      };

      controller.addEventListener('selectstart', () => {
        entry.isSelecting = true;
        activeAimingController = controller;
        laserMat.color.setHex(0xfbbf24);
      });

      controller.addEventListener('selectend', () => {
        entry.isSelecting = false;
        laserMat.color.setHex(i === 0 ? 0x38bdf8 : 0xf59e0b);
        if (activeAimingController === controller && validTeleportHit) {
          targetDollyPosRef.current = null;
          dolly.position.copy(validTeleportHit);
          reticleGroup.visible = false;
          validTeleportHit = null;
        }
        if (activeAimingController === controller) {
          activeAimingController = null;
          reticleGroup.visible = false;
        }
      });

      dolly.add(controller);
      controllers.push(entry);

      const grip = renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      dolly.add(grip);
    }

    // 8. Build Procedural Suburban House Matching Screenshot & Setup GLTFLoader + DRACOLoader
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const proceduralTextures = createProceduralTextures(maxAnisotropy);
    const proceduralHouse = buildProceduralUrbanHouse(proceduralTextures);
    scene.add(proceduralHouse);
    proceduralModelRef.current = proceduralHouse;
    activeModelRef.current = proceduralHouse;

    setupAndAlignModel(
      proceduralHouse,
      'Procedural Urban House (Reference Lot)',
      false,
      lotWidthRef.current,
      floorYOffsetRef.current,
      modelRotationDegRef.current
    );

    // Pre-compile shaders
    renderer.compile(scene, orbitCamera);

    // Configure GLTFLoader with DRACOLoader (1.5.7), KTX2Loader, and SpecularGlossiness compatibility
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    dracoLoader.preload();

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/'
    );
    ktx2Loader.detectSupport(renderer);

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setKTX2Loader(ktx2Loader);
    registerArchitecturalGlbCompatibilityPlugin(gltfLoader);
    gltfLoaderRef.current = gltfLoader;

    // Automatically attempt to load './urban_house.glb' on startup if present
    fetch('./urban_house.glb', { method: 'HEAD' })
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && !contentType.includes('text/html')) {
          loadGlbFromUrl('./urban_house.glb', 'urban_house.glb', true);
        }
      })
      .catch(() => {
        // Keep procedural house active if './urban_house.glb' is not hosted yet
      });

    // 9. Desktop Keyboard, Mouse Drag Look, Pointer Lock & Double-Click Teleport
    const keysPressed: Record<string, boolean> = {};
    let isDraggingLook = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const mouseNdc = new THREE.Vector2();

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        return;
      }
      keysPressed[e.code] = true;

      // Pressing WASD while in Orbit mode automatically transitions to 1.6m Walk mode
      if (
        cameraModeRef.current === 'orbit' &&
        (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyA' || e.code === 'KeyD')
      ) {
        cameraModeRef.current = 'walk';
        setCameraMode('walk');
        orbitControls.enabled = false;
        const surfY = findSurfaceYAt(
          orbitCamera.position.x,
          orbitCamera.position.z,
          floorYOffsetRef.current
        );
        dolly.position.set(orbitCamera.position.x, surfY, orbitCamera.position.z);
        const dx = orbitControls.target.x - orbitCamera.position.x;
        const dz = orbitControls.target.z - orbitCamera.position.z;
        const yaw = Math.atan2(-dx, -dz);
        targetLookRef.current.yaw = yaw;
        currentLookRef.current.yaw = yaw;
        targetLookRef.current.pitch = 0;
        currentLookRef.current.pitch = 0;
      }

      // Desktop Q / E 45-degree snap turn
      if (e.code === 'KeyQ') {
        targetLookRef.current.yaw += Math.PI / 4;
      } else if (e.code === 'KeyE') {
        targetLookRef.current.yaw -= Math.PI / 4;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== renderer.domElement) return;
      if (cameraModeRef.current === 'walk' && e.button === 0) {
        isDraggingLook = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (cameraModeRef.current !== 'walk') return;
      if (document.pointerLockElement === renderer.domElement) {
        targetLookRef.current.yaw -= e.movementX * 0.0022;
        targetLookRef.current.pitch = THREE.MathUtils.clamp(
          targetLookRef.current.pitch - e.movementY * 0.0022,
          -Math.PI / 2.2,
          Math.PI / 2.2
        );
      } else if (isDraggingLook) {
        const dx = e.clientX - prevMouseX;
        const dy = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        targetLookRef.current.yaw -= dx * 0.0032;
        targetLookRef.current.pitch = THREE.MathUtils.clamp(
          targetLookRef.current.pitch - dy * 0.0032,
          -Math.PI / 2.2,
          Math.PI / 2.2
        );
      }
    };

    const onPointerUp = () => {
      isDraggingLook = false;
    };

    // Double-click on any walkable surface to teleport the 1.6m eye-height dolly there
    const onDoubleClick = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const activeCam =
        cameraModeRef.current === 'orbit' ? orbitCamera : walkCamera;
      raycaster.setFromCamera(mouseNdc, activeCam);
      const hits = raycaster.intersectObjects(walkableMeshesRef.current, true);
      if (hits.length > 0) {
        const hit = hits[0];

        // If double-clicked from Orbit mode, switch into First-Person 1.6m Walk Mode at that spot
        if (cameraModeRef.current === 'orbit') {
          cameraModeRef.current = 'walk';
          setCameraMode('walk');
          setActiveViewpoint('custom-teleport');
          orbitControls.enabled = false;
          const dx = hit.point.x - orbitCamera.position.x;
          const dz = hit.point.z - orbitCamera.position.z;
          const yaw = Math.atan2(-dx, -dz);
          targetLookRef.current.yaw = yaw;
          currentLookRef.current.yaw = yaw;
          targetLookRef.current.pitch = 0;
          currentLookRef.current.pitch = 0;
          dolly.position.copy(hit.point);
        } else {
          targetDollyPosRef.current = hit.point.clone();
        }

        reticleGroup.position.copy(hit.point);
        reticleGroup.position.y += 0.02;
        reticleGroup.visible = true;
        setTimeout(() => {
          if (!activeAimingController) reticleGroup.visible = false;
        }, 650);
      }
    };

    const onPointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === renderer.domElement);
    };

    const onResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      walkCamera.aspect = aspect;
      walkCamera.updateProjectionMatrix();
      orbitCamera.aspect = aspect;
      orbitCamera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('resize', onResize);

    // 10. WebXR & Desktop Animation Loop
    const clock = new THREE.Clock();
    let snapTurnReady = true;
    let hudUpdateTimer = 0;

    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.1);
      const isPresenting = renderer.xr.isPresenting;

      if (isPresenting) {
        // ====================================================================
        // WEBXR VR MODE: Left Stick Smooth Walk (3.5 m/s), Right Stick 45° Snap Turn,
        // Controller Trigger Raycast Teleportation
        // ====================================================================
        const session = renderer.xr.getSession();
        if (session) {
          const xrCamera = renderer.xr.getCamera();
          xrCamera.getWorldQuaternion(_cameraWorldQuat);
          _euler.setFromQuaternion(_cameraWorldQuat, 'YXZ');

          _forward.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, _euler.y).normalize();
          _right.set(1, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, _euler.y).normalize();

          for (const source of session.inputSources) {
            if (!source.gamepad) continue;
            const axes = source.gamepad.axes;
            const stickX =
              axes.length >= 4 && Math.abs(axes[2]) > Math.abs(axes[0])
                ? axes[2]
                : axes[0] ?? 0;
            const stickY =
              axes.length >= 4 && Math.abs(axes[3]) > Math.abs(axes[1])
                ? axes[3]
                : axes[1] ?? 0;

            if (source.handedness === 'left') {
              const deadzone = 0.15;
              if (Math.abs(stickX) > deadzone || Math.abs(stickY) > deadzone) {
                const walkSpeed = 3.5;
                _moveVec
                  .set(0, 0, 0)
                  .addScaledVector(_forward, -stickY)
                  .addScaledVector(_right, stickX);
                if (_moveVec.lengthSq() > 1) _moveVec.normalize();
                dolly.position.addScaledVector(_moveVec, walkSpeed * delta);

                _downRayOrigin.set(dolly.position.x, dolly.position.y + 1.5, dolly.position.z);
                raycaster.set(_downRayOrigin, _downDir);
                raycaster.far = 3.0;
                const floorHits = raycaster.intersectObjects(walkableMeshesRef.current, true);
                raycaster.far = 100;
                if (floorHits.length > 0) {
                  const targetY = floorHits[0].point.y;
                  if (Math.abs(targetY - dolly.position.y) < 0.85) {
                    dolly.position.y = THREE.MathUtils.damp(
                      dolly.position.y,
                      targetY,
                      12,
                      delta
                    );
                  }
                }
              }
            } else if (source.handedness === 'right') {
              if (Math.abs(stickX) > 0.65) {
                if (snapTurnReady) {
                  dolly.rotation.y -= Math.sign(stickX) * (Math.PI / 4);
                  snapTurnReady = false;
                }
              } else if (Math.abs(stickX) < 0.25) {
                snapTurnReady = true;
              }
            }
          }
        }

        const controllerToCast =
          activeAimingController || controllers[1]?.controller || controllers[0]?.controller;

        if (controllerToCast && walkableMeshesRef.current.length > 0) {
          _tempMatrix.identity().extractRotation(controllerToCast.matrixWorld);
          _rayOrigin.setFromMatrixPosition(controllerToCast.matrixWorld);
          _rayDir.set(0, 0, -1).applyMatrix4(_tempMatrix).normalize();

          raycaster.set(_rayOrigin, _rayDir);
          const intersects = raycaster.intersectObjects(walkableMeshesRef.current, true);

          let chosenHit: THREE.Intersection | null = null;
          for (const hit of intersects) {
            if (hit.face) {
              _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
              _worldNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize();
              if (_worldNormal.y > 0.35) {
                chosenHit = hit;
                break;
              }
            } else {
              chosenHit = hit;
              break;
            }
          }
          if (!chosenHit && intersects.length > 0) {
            chosenHit = intersects[0];
          }

          const entry = controllers.find((c) => c.controller === controllerToCast);
          if (chosenHit) {
            if (entry) entry.laserLine.scale.z = chosenHit.distance;
            if (activeAimingController) {
              validTeleportHit = chosenHit.point.clone();
              reticleGroup.position.copy(chosenHit.point);
              reticleGroup.position.y += 0.02;
              reticleGroup.visible = true;
            }
          } else {
            if (entry) entry.laserLine.scale.z = 15;
            if (activeAimingController) {
              validTeleportHit = null;
              reticleGroup.visible = false;
            }
          }
        }

        renderer.render(scene, walkCamera);
      } else if (cameraModeRef.current === 'orbit') {
        // ====================================================================
        // DESKTOP 3D OVERVIEW ORBIT MODE (like Screenshot 1)
        // ====================================================================
        orbitControls.update();
        hudUpdateTimer += delta;
        if (hudUpdateTimer > 0.25) {
          hudUpdateTimer = 0;
          setPlayerCoords({
            x: Number(orbitCamera.position.x.toFixed(1)),
            y: Number(orbitCamera.position.y.toFixed(2)),
            z: Number(orbitCamera.position.z.toFixed(1)),
          });
        }
        renderer.render(scene, orbitCamera);
      } else {
        // ====================================================================
        // DESKTOP FIRST-PERSON WALK MODE (1.60m Eye Height + WASD + Teleport)
        // ====================================================================
        currentLookRef.current.yaw = THREE.MathUtils.damp(
          currentLookRef.current.yaw,
          targetLookRef.current.yaw,
          14,
          delta
        );
        currentLookRef.current.pitch = THREE.MathUtils.damp(
          currentLookRef.current.pitch,
          targetLookRef.current.pitch,
          14,
          delta
        );

        dolly.rotation.y = currentLookRef.current.yaw;
        walkCamera.rotation.x = currentLookRef.current.pitch;

        const moveF =
          (keysPressed['KeyW'] || keysPressed['ArrowUp'] ? 1 : 0) -
          (keysPressed['KeyS'] || keysPressed['ArrowDown'] ? 1 : 0);
        const moveS =
          (keysPressed['KeyD'] || keysPressed['ArrowRight'] ? 1 : 0) -
          (keysPressed['KeyA'] || keysPressed['ArrowLeft'] ? 1 : 0);

        if (moveF !== 0 || moveS !== 0) {
          targetDollyPosRef.current = null;
          const speed =
            keysPressed['ShiftLeft'] || keysPressed['ShiftRight'] ? 7.0 : 3.5;

          _forward
            .set(0, 0, -1)
            .applyAxisAngle(THREE.Object3D.DEFAULT_UP, dolly.rotation.y)
            .normalize();
          _right
            .set(1, 0, 0)
            .applyAxisAngle(THREE.Object3D.DEFAULT_UP, dolly.rotation.y)
            .normalize();

          _moveVec
            .set(0, 0, 0)
            .addScaledVector(_forward, moveF)
            .addScaledVector(_right, moveS)
            .normalize();

          dolly.position.addScaledVector(_moveVec, speed * delta);

          _downRayOrigin.set(dolly.position.x, dolly.position.y + 1.8, dolly.position.z);
          raycaster.set(_downRayOrigin, _downDir);
          raycaster.far = 3.5;
          const floorHits = raycaster.intersectObjects(walkableMeshesRef.current, true);
          raycaster.far = 100;
          if (floorHits.length > 0) {
            const targetY = floorHits[0].point.y;
            if (Math.abs(targetY - dolly.position.y) < 1.1) {
              dolly.position.y = THREE.MathUtils.damp(dolly.position.y, targetY, 10, delta);
            }
          }
        } else if (targetDollyPosRef.current) {
          dolly.position.x = THREE.MathUtils.damp(
            dolly.position.x,
            targetDollyPosRef.current.x,
            8,
            delta
          );
          dolly.position.y = THREE.MathUtils.damp(
            dolly.position.y,
            targetDollyPosRef.current.y,
            8,
            delta
          );
          dolly.position.z = THREE.MathUtils.damp(
            dolly.position.z,
            targetDollyPosRef.current.z,
            8,
            delta
          );
          if (dolly.position.distanceToSquared(targetDollyPosRef.current) < 0.002) {
            targetDollyPosRef.current = null;
          }
        }

        hudUpdateTimer += delta;
        if (hudUpdateTimer > 0.25) {
          hudUpdateTimer = 0;
          setPlayerCoords({
            x: Number(dolly.position.x.toFixed(1)),
            y: Number(dolly.position.y.toFixed(2)),
            z: Number(dolly.position.z.toFixed(1)),
          });
        }

        renderer.render(scene, walkCamera);
      }
    });

    return () => {
      renderer.setAnimationLoop(null);
      renderer.xr.removeEventListener('sessionstart', onSessionStart);
      renderer.xr.removeEventListener('sessionend', onSessionEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('resize', onResize);

      orbitControls.dispose();
      dracoLoader.dispose();
      ktx2Loader.dispose();
      proceduralTextures.dispose();
      renderer.dispose();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, [loadGlbFromUrl, setupAndAlignModel, findSurfaceYAt]);

  // Full-Window Drag-and-Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLocalFile(file);
    }
  };

  const handleLotWidthChange = (val: number) => {
    setLotWidth(val);
    lotWidthRef.current = val;
    updateModelScaleAndOffset(val, floorYOffsetRef.current, modelRotationDegRef.current);
  };

  const handleFloorYOffsetChange = (val: number) => {
    setFloorYOffset(val);
    floorYOffsetRef.current = val;
    updateModelScaleAndOffset(lotWidthRef.current, val, modelRotationDegRef.current);
  };

  const handleRotateModel90 = () => {
    const nextRot = (modelRotationDegRef.current + 90) % 360;
    setModelRotationDeg(nextRot);
    modelRotationDegRef.current = nextRot;
    updateModelScaleAndOffset(lotWidthRef.current, floorYOffsetRef.current, nextRot);
  };

  const handleExposureChange = (val: number) => {
    setExposure(val);
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = val;
    }
  };

  const togglePointerLock = () => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    if (cameraModeRef.current === 'orbit') {
      jumpToViewpoint(VIEWPOINT_PRESETS[1]); // Switch to Front Street Walk mode first
    }
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    } else {
      canvas.requestPointerLock?.();
    }
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-neutral-950 select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Dedicated WebGL / WebXR Canvas Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Full-Window Drag-and-Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 border-4 border-dashed border-amber-400 pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl text-center">
            <Upload className="w-12 h-12 text-amber-400" />
            <p className="text-xl font-bold text-white tracking-tight">
              Drop .GLB / .GLTF Model Anywhere to Load
            </p>
            <p className="text-sm text-neutral-300">
              Automatically centers on X/Z, aligns floor to y = 0, and scales to {lotWidth}m width
            </p>
          </div>
        </div>
      )}

      {/* ====================================================================
          TOP-LEFT FLOATING ARCHITECTURAL INSPECTOR & GLB LOADER PANEL
         ==================================================================== */}
      <aside className="fixed top-4 left-4 z-20 w-[375px] max-w-[calc(100vw-2rem)] rounded-xl bg-neutral-950/92 border border-white/12 shadow-2xl text-neutral-100 transition-transform duration-200">
        {/* Panel Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white truncate">
              Urban House WebXR Tour
            </h1>
            <p className="text-xs text-neutral-400 truncate">
              1 Unit = 1.0 Meter · Eye Height 1.60m
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPanelCollapsed((prev) => !prev)}
            className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title={isPanelCollapsed ? 'Expand Inspector Panel' : 'Collapse Inspector Panel'}
          >
            {isPanelCollapsed ? (
              <Maximize2 className="w-4 h-4" />
            ) : (
              <Minimize2 className="w-4 h-4" />
            )}
          </button>
        </div>

        {!isPanelCollapsed && (
          <div className="p-4 space-y-4 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
            {/* 1. In-App GLB File Uploader, Drag-and-Drop & URL Loader */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">
                  01. Model Loader (.GLB / .GLTF)
                </span>
                <span className="text-xs font-mono text-neutral-400">Draco + SpecGloss</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLocalFile(file);
                  e.target.value = '';
                }}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Upload Local .GLB File</span>
                </button>

                {modelMetrics.isCustomGlb && (
                  <button
                    type="button"
                    onClick={restoreProceduralHouse}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
                    title="Restore Procedural Urban House"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* URL Input + Load URL Button */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = glbUrlInput.trim();
                  if (trimmed) {
                    const filename = trimmed.split('/').pop() || 'Remote Model.glb';
                    loadGlbFromUrl(trimmed, filename, false);
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <div className="relative flex-1">
                  <Link2 className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={glbUrlInput}
                    onChange={(e) => setGlbUrlInput(e.target.value)}
                    placeholder="./urban_house.glb or https://..."
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-neutral-900 border border-white/12 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="py-1.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs font-semibold text-white border border-white/12 transition-colors whitespace-nowrap cursor-pointer shrink-0"
                >
                  Load URL
                </button>
              </form>

              {/* Status Banner & Progress */}
              <div
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs ${
                  statusMessage.type === 'error'
                    ? 'bg-red-950/60 border-red-500/30 text-red-200'
                    : statusMessage.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
                    : 'bg-neutral-900/90 border-white/10 text-neutral-300'
                }`}
              >
                {statusMessage.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                ) : statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="leading-snug break-words">{statusMessage.text}</p>
                  {isLoading && (
                    <div className="mt-1.5 w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-150"
                        style={{ width: `${Math.max(10, loadingProgress)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <hr className="border-white/10" />

            {/* 2. Real-World Scale & Floor Alignment Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>02. Scale & Floor Alignment</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotateModel90}
                    className="flex items-center gap-1 text-xs text-neutral-300 hover:text-white bg-neutral-800 px-2 py-0.5 rounded border border-white/10 cursor-pointer"
                    title="Rotate Model 90° around Y axis"
                  >
                    <RotateCw className="w-3 h-3 text-amber-400" />
                    <span className="font-mono">{modelRotationDeg}°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleLotWidthChange(40);
                      handleFloorYOffsetChange(0);
                      handleExposureChange(0.95);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Lot Width Slider (10m - 100m) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="lot-width-slider" className="text-neutral-300 font-medium">
                    Lot Width (10m - 100m)
                  </label>
                  <span className="font-mono font-semibold text-amber-400">
                    {lotWidth.toFixed(0)} m
                  </span>
                </div>
                <input
                  id="lot-width-slider"
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={lotWidth}
                  onChange={(e) => handleLotWidthChange(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Floor Y-Offset Slider (-5m to +5m) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="floor-offset-slider" className="text-neutral-300 font-medium">
                    Floor Y-Offset (-5m to +5m)
                  </label>
                  <span className="font-mono font-semibold text-amber-400">
                    {floorYOffset >= 0 ? `+${floorYOffset.toFixed(2)}` : floorYOffset.toFixed(2)} m
                  </span>
                </div>
                <input
                  id="floor-offset-slider"
                  type="range"
                  min={-5}
                  max={5}
                  step={0.05}
                  value={floorYOffset}
                  onChange={(e) => handleFloorYOffsetChange(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Lighting Exposure Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="exposure-slider"
                    className="text-neutral-300 font-medium flex items-center gap-1"
                  >
                    <Sun className="w-3 h-3 text-amber-400" />
                    <span>Daylight Exposure</span>
                  </label>
                  <span className="font-mono font-semibold text-amber-400">
                    {exposure.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="exposure-slider"
                  type="range"
                  min={0.3}
                  max={1.8}
                  step={0.05}
                  value={exposure}
                  onChange={(e) => handleExposureChange(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Computed Bounding Box Readout */}
              <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-white/8 text-xs space-y-1">
                <div className="flex items-center justify-between text-neutral-400">
                  <span className="truncate max-w-[175px]">{modelMetrics.name}</span>
                  <span className="font-mono text-neutral-300">
                    {modelMetrics.meshCount} meshes · {modelMetrics.textureCount} tex
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] text-neutral-300 pt-0.5">
                  <span>W: {modelMetrics.widthMeters}m</span>
                  <span>·</span>
                  <span>H: {modelMetrics.heightMeters}m</span>
                  <span>·</span>
                  <span>D: {modelMetrics.depthMeters}m</span>
                </div>
              </div>
            </div>

            <hr className="border-white/10" />

            {/* 3. Quick Viewpoints & Desktop / VR Locomotion */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>03. Viewpoints & Camera Mode</span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  ({playerCoords.x}m, {playerCoords.y}m, {playerCoords.z}m)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {VIEWPOINT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => jumpToViewpoint(preset)}
                    className={`flex items-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                      activeViewpoint === preset.id
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-white/10 text-neutral-300'
                    }`}
                  >
                    {preset.mode === 'orbit' ? (
                      <Orbit className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : (
                      <Navigation className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                    <span className="truncate">{preset.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={togglePointerLock}
                  className={`flex items-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                    isPointerLocked
                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-white/10 text-neutral-300'
                  }`}
                >
                  <Eye className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {isPointerLocked ? 'Unlock Mouse' : 'FPS Mouse Lock'}
                  </span>
                </button>
              </div>
            </div>

            {/* Locomotion Instructions Summary */}
            <div className="p-2.5 rounded-lg bg-neutral-900/75 border border-white/8 text-[11px] text-neutral-300 space-y-1.5">
              <div className="flex items-center justify-between text-neutral-200 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Footprints className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>VR & Desktop Locomotion</span>
                </span>
                <span className="font-mono text-amber-400">
                  {cameraMode === 'orbit' ? 'Orbit Mode' : '1.6m Walk Mode'}
                </span>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                <strong className="text-neutral-200">Desktop:</strong> Orbit or press{' '}
                <span className="font-mono text-neutral-200">WASD</span> to walk at 1.6m eye height ·{' '}
                <span className="font-mono text-neutral-200">Q/E</span> 45° snap turn ·{' '}
                <strong className="text-neutral-200">Double-click</strong> any surface to stand there.
              </p>
              <p className="text-neutral-400 leading-relaxed">
                <strong className="text-neutral-200">WebXR VR:</strong> Left Stick smooth walk (3.5
                m/s) · Right Stick 45° snap turn · Hold & release Trigger to teleport.
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Bottom-Right WebXR VR Entry Bar & Quick Telemetry */}
      <div className="fixed bottom-4 right-4 z-20 flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-neutral-950/90 border border-white/12 shadow-xl">
        <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-300 pr-2 border-r border-white/10">
          <MousePointerClick className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Double-click surface to stand (1.6m)</span>
          <span aria-hidden="true">·</span>
          <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-mono">
            Eye: {cameraMode === 'orbit' ? `${playerCoords.y.toFixed(1)}m (Orbit)` : `${(playerCoords.y + 1.6).toFixed(2)}m`}
          </span>
        </div>
        {/* Three.js VRButton Mount */}
        <div ref={vrButtonMountRef} className="flex items-center" />
      </div>
    </div>
  );
}
