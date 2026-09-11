import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCcw, Box, Play, Pause, ZoomIn, ZoomOut, Maximize2, Loader2, Copy, Check, Navigation, Layers } from 'lucide-react';
import { api } from '../services/api';

// Builds a semi-transparent surface (+ outline) per pothole from its reference_plane_mesh — a
// small triangulated patch of the fitted RANSAC road-surface plane, already CLIPPED to that
// pothole's own mask contour on the backend (see
// backend/app/services/depth.py::compute_reference_plane_mesh), given as real-world [X, Y, Z]
// vertices + triangle face indices. Added as a CHILD of the loaded mesh object so it automatically
// inherits the exact same rotation/scale/position fit-to-view transform, instead of needing to
// duplicate that math here.
//
// ASSUMPTION this relies on: the uploaded Pix4D mesh is georeferenced in the same CRS/origin as the
// orthomosaic & DSM the plane was fit from (true for a standard same-survey Pix4D export). rawBox
// (the mesh's own bounding box, measured before any fit transform) is used as a sanity check —
// planes whose real-world position is wildly outside the mesh's own bounding box (e.g. the
// synthetic sample dataset, whose mesh and DSM are unrelated) are skipped rather than rendered
// nonsensically far away.
function buildReferencePlaneOverlay(rawBox, potholesData) {
  if (!potholesData || potholesData.length === 0) return { group: null, available: false };

  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawCenter = rawBox.getCenter(new THREE.Vector3());
  const rawDiagonal = rawSize.length() || 1;

  const group = new THREE.Group();
  group.name = 'ransac-reference-planes';
  let addedAny = false;

  potholesData.forEach((p) => {
    const surf = p.reference_plane_mesh;
    if (!surf || !surf.vertices || !surf.faces || surf.vertices.length < 3 || surf.faces.length === 0) return;

    const vcount = surf.vertices.length;
    let cx = 0, cy = 0, cz = 0;
    surf.vertices.forEach((v) => { cx += v[0] / vcount; cy += v[1] / vcount; cz += v[2] / vcount; });
    const dist = Math.sqrt((cx - rawCenter.x) ** 2 + (cy - rawCenter.y) ** 2 + (cz - rawCenter.z) ** 2);
    if (dist > rawDiagonal * 25) return; // coordinate frame mismatch guard — see note above

    const positions = new Float32Array(surf.vertices.flat());
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(surf.faces.flat());
    geometry.computeVertexNormals();

    const planeMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xff9500,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    planeMesh.userData.instanceId = p.instance_id;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.85 })
    );

    group.add(planeMesh);
    group.add(edges);
    addedAny = true;
  });

  return { group: addedAny ? group : null, available: addedAny };
}

// Solves the 3x3 linear system A·x = b via Cramer's rule. Used for the least-squares plane refit
// below (3 unknowns: a, b, c in elevation = a*h1 + b*h2 + c).
function solve3x3(A, b) {
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  if (Math.abs(D) < 1e-9) return null;
  const withCol = (col) => A.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)));
  return [det3(withCol(0)) / D, det3(withCol(1)) / D, det3(withCol(2)) / D];
}

// Fallback for when the mesh's own coordinates don't share a frame with the backend's DSM-derived
// reference_plane_mesh (see buildReferencePlaneOverlay above) — e.g. a small local-scale mesh
// export. Runs an independent RANSAC plane fit directly on THIS mesh's own vertex point cloud: the
// "elevation" axis is taken as whichever of x/y/z has the smallest spread (a road's vertical relief
// is small next to its horizontal extent), and the plane is fit against the other two axes.
//
// IMPORTANT: unlike depth.py (which always has a real surrounding road ring because the DSM covers
// the whole survey), a mesh exported as a close crop of just one pothole can be almost ENTIRELY the
// hole itself, with only a thin lip of true road right at its outer edge. Fitting against ALL
// vertices in that case would let the crater's own (far more numerous) points dominate and pull the
// "reference" plane into the hole. So — mirroring depth.py's ring_mask concept — the fit is
// restricted to an outer RING of points (by horizontal radius from the mesh's own center), falling
// back to all points only if that ring turns out too sparse (e.g. a mesh that genuinely is a
// road+pothole cutout with plenty of flat surface everywhere).
//
// NOTE: this is an independent, approximate fit for VISUAL purposes only. Its numbers are in the
// mesh's own (possibly unscaled/relative) units and will not match the depth_max/volume figures in
// the results table, which come from the georeferenced DSM pipeline.
function fitLocalRansacPlane(object, rawBox) {
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const axisSizes = [rawSize.x, rawSize.y, rawSize.z];
  const elevAxis = axisSizes.indexOf(Math.min(...axisSizes));
  const horizAxes = [0, 1, 2].filter((i) => i !== elevAxis);

  // Collect vertex positions (in object's own local frame — OBJLoader child meshes normally carry
  // an identity local transform, with all geometry already baked into vertex positions).
  const pts = [];
  object.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position) {
      const arr = child.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) pts.push([arr[i], arr[i + 1], arr[i + 2]]);
    }
  });
  if (pts.length < 10) return null;

  // Restrict to the outer ring by horizontal radius from center (mirrors depth.py's ring_mask —
  // only the outer band is assumed to still be intact road, not the hole itself).
  const center = rawBox.getCenter(new THREE.Vector3());
  const h1c = center.getComponent(horizAxes[0]), h2c = center.getComponent(horizAxes[1]);
  let maxRadius = 0;
  const radii = pts.map((p) => {
    const r = Math.hypot(p[horizAxes[0]] - h1c, p[horizAxes[1]] - h2c);
    if (r > maxRadius) maxRadius = r;
    return r;
  });
  const RING_INNER_RATIO = 0.8; // keep only the outer 20% of points by radius
  let ringPts = pts.filter((_, i) => radii[i] >= RING_INNER_RATIO * maxRadius);
  if (ringPts.length < 20) ringPts = pts; // fall back to all points if the ring is too sparse

  // Subsample for performance on dense meshes.
  const MAX_POINTS = 3000;
  const stride = Math.max(1, Math.floor(ringPts.length / MAX_POINTS));
  const sample = [];
  for (let i = 0; i < ringPts.length; i += stride) sample.push(ringPts[i]);

  const elevRange = axisSizes[elevAxis] || 1;
  const threshold = Math.max(elevRange * 0.06, 1e-4);

  const planeAt = (a, b, c, h1, h2) => a * h1 + b * h2 + c;

  let best = null;
  const TRIALS = 60;
  for (let t = 0; t < TRIALS; t++) {
    const i1 = Math.floor(Math.random() * sample.length);
    let i2, i3;
    do { i2 = Math.floor(Math.random() * sample.length); } while (i2 === i1);
    do { i3 = Math.floor(Math.random() * sample.length); } while (i3 === i1 || i3 === i2);
    const p1 = sample[i1], p2 = sample[i2], p3 = sample[i3];
    const A = [
      [p1[horizAxes[0]], p1[horizAxes[1]], 1],
      [p2[horizAxes[0]], p2[horizAxes[1]], 1],
      [p3[horizAxes[0]], p3[horizAxes[1]], 1]
    ];
    const sol = solve3x3(A, [p1[elevAxis], p2[elevAxis], p3[elevAxis]]);
    if (!sol) continue;
    const [a, b, c] = sol;
    let inliers = 0;
    sample.forEach((p) => {
      const resid = Math.abs(p[elevAxis] - planeAt(a, b, c, p[horizAxes[0]], p[horizAxes[1]]));
      if (resid <= threshold) inliers++;
    });
    if (!best || inliers > best.inliers) best = { a, b, c, inliers, i1, i2, i3 };
  }
  if (!best) return null;

  // Final least-squares refit on the winning inlier set (standard normal equations for
  // elevation = a*h1 + b*h2 + c).
  const inlierPts = sample.filter((p) => {
    const resid = Math.abs(p[elevAxis] - planeAt(best.a, best.b, best.c, p[horizAxes[0]], p[horizAxes[1]]));
    return resid <= threshold;
  });
  let Sh1h1 = 0, Sh1h2 = 0, Sh2h2 = 0, Sh1 = 0, Sh2 = 0, Sh1e = 0, Sh2e = 0, Se = 0;
  const n = inlierPts.length;
  inlierPts.forEach((p) => {
    const h1 = p[horizAxes[0]], h2 = p[horizAxes[1]], e = p[elevAxis];
    Sh1h1 += h1 * h1; Sh1h2 += h1 * h2; Sh2h2 += h2 * h2;
    Sh1 += h1; Sh2 += h2; Sh1e += h1 * e; Sh2e += h2 * e; Se += e;
  });
  const refit = solve3x3(
    [[Sh1h1, Sh1h2, Sh1], [Sh1h2, Sh2h2, Sh2], [Sh1, Sh2, n]],
    [Sh1e, Sh2e, Se]
  ) || [best.a, best.b, best.c];
  let [a, b, c] = refit;

  // Footprint: a RECTANGLE sized to just the hole itself (not the mesh's whole bounding box) — using
  // each point's own deviation from center along h1/h2 as the rectangle's half-extents. Spanning the
  // full bbox (a prior version of this function did) drags the patch out over the surrounding
  // uneven terrain too, where a flat plane inevitably clips through bumps/slopes and reads as
  // "melting into" the mesh rather than a clean lid over the hole. Subdivided into a dense GRID_N x
  // GRID_N grid (rather than a single quad) so the patch reads as a surveyor's flat reference grid,
  // making its flatness legible against the mesh's own bumpy scan surface underneath it.
  let h1r = 0, h2r = 0;
  pts.forEach((p) => {
    h1r = Math.max(h1r, Math.abs(p[horizAxes[0]] - h1c));
    h2r = Math.max(h2r, Math.abs(p[horizAxes[1]] - h2c));
  });
  h1r *= 0.96; h2r *= 0.96; // slight inset so the rectangle's edge sits just inside the true outer edge

  const GRID_N = 20; // 20x20 cells = 21x21 vertices, denser than the previous single quad
  const toVertex = ([h1, h2]) => {
    const v = [0, 0, 0];
    v[horizAxes[0]] = h1;
    v[horizAxes[1]] = h2;
    v[elevAxis] = planeAt(a, b, c, h1, h2);
    return v;
  };

  // Stability guard: a ring fit from just 3 sampled points (or a thin/near-collinear ring) can
  // produce a plane with an extreme slope that looks fine near the ring but shoots far outside the
  // mesh's own elevation range once extrapolated across the rectangle. If that happens, fall back to
  // a flat (untilted) patch at the ring's own mean elevation instead of a wildly slanted one.
  const cornerElevs = [
    planeAt(a, b, c, h1c - h1r, h2c - h2r), planeAt(a, b, c, h1c + h1r, h2c - h2r),
    planeAt(a, b, c, h1c + h1r, h2c + h2r), planeAt(a, b, c, h1c - h1r, h2c + h2r)
  ];
  const elevSpread = Math.max(...cornerElevs) - Math.min(...cornerElevs);
  if (elevSpread > elevRange * 2.5) {
    const meanElev = inlierPts.reduce((s, p) => s + p[elevAxis], 0) / n;
    a = 0; b = 0; c = meanElev;
  }

  // Build the grid: (GRID_N+1) x (GRID_N+1) vertices, 2 triangles per cell.
  const gridVertices = [];
  const vertexIndex = (i, j) => i * (GRID_N + 1) + j;
  for (let i = 0; i <= GRID_N; i++) {
    const h1 = h1c - h1r + (2 * h1r * i) / GRID_N;
    for (let j = 0; j <= GRID_N; j++) {
      const h2 = h2c - h2r + (2 * h2r * j) / GRID_N;
      gridVertices.push(toVertex([h1, h2]));
    }
  }
  const faces = [];
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const v00 = vertexIndex(i, j), v10 = vertexIndex(i + 1, j);
      const v01 = vertexIndex(i, j + 1), v11 = vertexIndex(i + 1, j + 1);
      faces.push([v00, v01, v10], [v10, v01, v11]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gridVertices.flat()), 3));
  geometry.setIndex(faces.flat());
  geometry.computeVertexNormals();

  const planeMesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );

  // WireframeGeometry (not EdgesGeometry) draws every triangle edge — including the internal grid
  // lines, not just the outer silhouette — so the denser grid is actually visible, not just implied.
  const gridLines = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.35 })
  );

  const group = new THREE.Group();
  group.name = 'ransac-reference-plane-local-fit';
  group.add(planeMesh);
  group.add(gridLines);

  return { group, inlierRatio: best.inliers / sample.length };
}

export default function ThreeMeshViewer({ meshData, potholes = [] }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const loadedMeshRef = useRef(null);
  const referencePlaneGroupRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showReferencePlanes, setShowReferencePlanes] = useState(true);
  const [referencePlanesAvailable, setReferencePlanesAvailable] = useState(false);
  // 'backend' = exact RANSAC result from the DSM pipeline (matches the results table's numbers).
  // 'local-fit' = independent RANSAC fit on this mesh's own point cloud (visual approximation only,
  // used when the mesh doesn't share a coordinate frame with the DSM — see fitLocalRansacPlane).
  const [referencePlaneSource, setReferencePlaneSource] = useState(null);

  // Live 3D Camera & Target Coordinates State
  const [cameraCoords, setCameraCoords] = useState({ x: 0, y: 6, z: 5.5 });
  const [targetCoords, setTargetCoords] = useState({ x: 0, y: 0, z: 0 });
  const [rotationCoords, setRotationCoords] = useState({ x: 0, y: 0, z: 0 });
  const [copied, setCopied] = useState(false);

  const objUrl = api.getImageUrl(meshData?.obj);
  const mtlUrl = api.getImageUrl(meshData?.mtl);
  const textureUrl = api.getImageUrl(meshData?.texture);

  useEffect(() => {
    if (!mountRef.current || !objUrl) return;

    setLoading(true);
    setError(null);

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);

    // 2. Camera Setup (Top-Down Isometric Forward View Angle)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 6, 5.5);

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // Clear previous children if any
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.0;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Event listener for live coordinate updates during Pan / Rotate / Zoom
    const updateCoords = () => {
      setCameraCoords({
        x: Number(camera.position.x.toFixed(2)),
        y: Number(camera.position.y.toFixed(2)),
        z: Number(camera.position.z.toFixed(2))
      });
      setTargetCoords({
        x: Number(controls.target.x.toFixed(2)),
        y: Number(controls.target.y.toFixed(2)),
        z: Number(controls.target.z.toFixed(2))
      });
      setRotationCoords({
        x: Number(THREE.MathUtils.radToDeg(camera.rotation.x).toFixed(1)),
        y: Number(THREE.MathUtils.radToDeg(camera.rotation.y).toFixed(1)),
        z: Number(THREE.MathUtils.radToDeg(camera.rotation.z).toFixed(1))
      });
    };

    controls.addEventListener('change', updateCoords);
    updateCoords();

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight1.position.set(0, 20, 15);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4facfe, 0.4);
    dirLight2.position.set(-10, -10, -10);
    scene.add(dirLight2);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x00f2fe, 0x1e293b);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    const fitAndCenterMesh = (object) => {
      // 1. Initial bounding box measurement
      const rawBox = new THREE.Box3().setFromObject(object);
      const rawSize = rawBox.getSize(new THREE.Vector3());

      // If mesh is Z-up (Pix4D mapper standard OBJ), rotate -90 deg on X axis to lay flat on X-Z plane
      if (rawSize.y > rawSize.z) {
        object.rotation.x = -Math.PI / 2;
      }

      // 2. Scale object nicely to ~6 units max dimension
      const scaledBox = new THREE.Box3().setFromObject(object);
      const size = scaledBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 6.0 / maxDim;
        object.scale.set(scale, scale, scale);
      }

      // 3. Center X and Z at 0, and align bottom Y at 0 (sitting ON TOP of grid ground plane!)
      const finalBox = new THREE.Box3().setFromObject(object);
      const finalCenter = finalBox.getCenter(new THREE.Vector3());

      object.position.x -= finalCenter.x;
      object.position.y -= finalBox.min.y; // Sit directly on top of grid Y = 0
      object.position.z -= finalCenter.z;

      // RANSAC reference-plane overlay: added as a child of `object` (in the mesh's own raw,
      // pre-transform coordinate frame) so it inherits the rotation/scale/position set above for free.
      // Prefer the exact backend/DSM-derived planes; only fall back to an independent local fit on
      // this mesh's own points when none of those land inside the mesh's own coordinate frame.
      let refPlaneGroup = null;
      let source = null;
      const backendResult = buildReferencePlaneOverlay(rawBox, potholes);
      if (backendResult.group) {
        refPlaneGroup = backendResult.group;
        source = 'backend';
      } else {
        try {
          const localFit = fitLocalRansacPlane(object, rawBox);
          if (localFit?.group) {
            refPlaneGroup = localFit.group;
            source = 'local-fit';
          }
        } catch (e) {
          console.warn('Local RANSAC plane fit failed:', e);
        }
      }
      if (refPlaneGroup) {
        refPlaneGroup.visible = showReferencePlanes;
        object.add(refPlaneGroup);
        referencePlaneGroupRef.current = refPlaneGroup;
      }
      setReferencePlanesAvailable(!!refPlaneGroup);
      setReferencePlaneSource(source);

      loadedMeshRef.current = object;
      scene.add(object);

      // 4. Set camera to top-down view facing road surface from above
      camera.position.set(0, 7.5, 3.5);
      controls.target.set(0, 0.5, 0);
      controls.saveState();
      updateCoords();
      setLoading(false);
    };

    // 6. Load MTL and OBJ files
    const mtlLoader = new MTLLoader();
    
    if (mtlUrl) {
      const mtlBasePath = mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1);
      mtlLoader.setPath(mtlBasePath);
      const mtlFileName = mtlUrl.substring(mtlUrl.lastIndexOf('/') + 1);
      
      mtlLoader.load(
        mtlFileName,
        (materials) => {
          materials.preload();
          
          const objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          
          objLoader.load(
            objUrl,
            (object) => fitAndCenterMesh(object),
            undefined,
            (err) => {
              console.error('Error loading OBJ with MTL:', err);
              loadObjWithoutMtl(objUrl, scene, fitAndCenterMesh, setError);
            }
          );
        },
        undefined,
        (err) => {
          console.error('Error loading MTL:', err);
          loadObjWithoutMtl(objUrl, scene, fitAndCenterMesh, setError);
        }
      );
    } else {
      loadObjWithoutMtl(objUrl, scene, fitAndCenterMesh, setError);
    }

    // 7. Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      controls.removeEventListener('change', updateCoords);
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [objUrl, mtlUrl, textureUrl, potholes]);

  // Helper for loading OBJ directly without MTL
  const loadObjWithoutMtl = (url, scene, onComplete, setErrorState) => {
    const objLoader = new OBJLoader();
    objLoader.load(
      url,
      (object) => {
        const defaultMaterial = new THREE.MeshStandardMaterial({
          color: 0x4facfe,
          roughness: 0.6,
          metalness: 0.2
        });

        object.traverse((child) => {
          if (child.isMesh) child.material = defaultMaterial;
        });

        onComplete(object);
      },
      undefined,
      (err) => {
        console.error('Error loading OBJ:', err);
        setErrorState('Gagal memuat model 3D OBJ.');
        setLoading(false);
      }
    );
  };

  // Toggle Wireframe
  const toggleWireframe = () => {
    if (!loadedMeshRef.current) return;
    const newW = !wireframe;
    setWireframe(newW);

    loadedMeshRef.current.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = newW));
        } else if (child.material) {
          child.material.wireframe = newW;
        }
      }
    });
  };

  // Toggle RANSAC Reference Plane Overlay
  const toggleReferencePlanes = () => {
    const newVal = !showReferencePlanes;
    setShowReferencePlanes(newVal);
    if (referencePlaneGroupRef.current) {
      referencePlaneGroupRef.current.visible = newVal;
    }
  };

  // Toggle Auto Rotate
  const toggleAutoRotate = () => {
    const newRotate = !autoRotate;
    setAutoRotate(newRotate);
    if (controlsRef.current) {
      controlsRef.current.autoRotate = newRotate;
    }
  };

  // Reset Camera View
  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  // Zero Position Handler: Set Camera & Target to origin (0, 0, 0) top-down view
  const handleZeroPosition = () => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0.5, 0);
      controlsRef.current.object.position.set(0, 7.5, 3.5);
      controlsRef.current.update();
    }
  };

  // Copy Camera Position Code to Clipboard
  const handleCopyCoords = () => {
    const codeSnippet = `camera.position.set(${cameraCoords.x}, ${cameraCoords.y}, ${cameraCoords.z});\ncontrols.target.set(${targetCoords.x}, ${targetCoords.y}, ${targetCoords.z});`;
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box size={20} color="var(--accent-cyan)" /> Visualisasi 3D Surface Model Interaktif (Pix4D Mesh)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Gunakan Klik-Kiri untuk Memutar 360°, Klik-Kanan untuk Menggeser, dan Scroll Mouse untuk Zoom.
          </p>
        </div>

        {/* 3D Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleZeroPosition}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            title="Set Kamera & Target ke Posisi Zero Origin (0, 0, 0)"
          >
            <Navigation size={14} color="var(--accent-cyan)" /> Posisi Zero (0,0,0)
          </button>
          <button
            onClick={toggleAutoRotate}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              background: autoRotate ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
              color: autoRotate ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
          >
            {autoRotate ? <Pause size={14} /> : <Play size={14} />} {autoRotate ? 'Stop Rotasi' : 'Auto Rotate'}
          </button>

          <button
            onClick={toggleWireframe}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              background: wireframe ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
              color: wireframe ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
          >
            {wireframe ? 'Solid Surface' : 'Wireframe 3D'}
          </button>

          <button onClick={handleResetCamera} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Reset Kamera Ke Depan">
            <RotateCcw size={14} /> Reset View
          </button>

          {referencePlanesAvailable && (
            <button
              onClick={toggleReferencePlanes}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                background: showReferencePlanes ? 'rgba(255, 149, 0, 0.18)' : 'transparent',
                color: showReferencePlanes ? '#ff9500' : 'var(--text-secondary)',
                borderColor: showReferencePlanes ? 'rgba(255, 149, 0, 0.4)' : undefined
              }}
              title="Tampilkan/sembunyikan bidang referensi hasil RANSAC 3D Plane Fitting per lubang"
            >
              <Layers size={14} /> {showReferencePlanes ? 'Sembunyikan' : 'Tampilkan'} Bidang Referensi RANSAC
            </button>
          )}
        </div>
      </div>

      {referencePlanesAvailable && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '-8px' }}>
          <span style={{ color: '#ff9500', fontWeight: 700 }}>■</span> Bidang oranye = permukaan jalan
          referensi hasil RANSAC 3D Plane Fitting (<code>z = a·x + b·y + c</code>) — selisih tinggi
          antara bidang ini dan mesh asli di bawahnya adalah kedalaman lubang.
          {referencePlaneSource === 'local-fit' && (
            <>
              {' '}<strong>Catatan:</strong> mesh ini tidak berbagi koordinat dunia nyata dengan DSM,
              jadi bidang ini adalah fitting RANSAC independen langsung pada titik-titik mesh —
              akurat secara visual, tapi angkanya tidak mewakili nilai di tabel hasil (satuan mesh
              berbeda dari satuan DSM).
            </>
          )}
        </p>
      )}

      {/* 3D Canvas Viewport */}
      <div style={{ position: 'relative', width: '100%', height: '540px', borderRadius: '14px', overflow: 'hidden', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(5, 8, 17, 0.85)', zIndex: 10, gap: '12px' }}>
            <Loader2 size={42} color="var(--accent-cyan)" style={{ animation: 'spin 1.5s linear infinite' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Memuat Model 3D Mesh (.obj + .mtl)...</span>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Live HUD Coordinate Overlay Display */}
        {!loading && !error && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            zIndex: 10,
            background: 'rgba(5, 8, 17, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '0.8rem',
            color: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={18} color="var(--accent-cyan)" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Posisi Kamera (XYZ):</span>
                <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                  X: {cameraCoords.x}, Y: {cameraCoords.y}, Z: {cameraCoords.z}
                </span>
              </div>
            </div>

            <div style={{ height: '24px', width: '1px', background: 'var(--border-color)' }} />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Target LookAt (XYZ):</span>
              <span className="font-mono" style={{ color: '#ffffff', fontWeight: 600 }}>
                X: {targetCoords.x}, Y: {targetCoords.y}, Z: {targetCoords.z}
              </span>
            </div>

            <div style={{ height: '24px', width: '1px', background: 'var(--border-color)' }} />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sudut Rotasi (Deg):</span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                X: {rotationCoords.x}°, Y: {rotationCoords.y}°
              </span>
            </div>

            <button
              onClick={handleCopyCoords}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                borderColor: 'rgba(0, 242, 254, 0.4)',
                background: 'rgba(0, 242, 254, 0.1)',
                color: 'var(--accent-cyan)'
              }}
              title="Salin Kode Posisi Kamera Ke Clipboard"
            >
              {copied ? <Check size={14} color="#34c759" /> : <Copy size={14} />} {copied ? 'Tersalin!' : 'Salin Kode Posisi'}
            </button>
          </div>
        )}

        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
