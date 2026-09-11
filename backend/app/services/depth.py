import cv2
import numpy as np
import rasterio
from sklearn.linear_model import RANSACRegressor, LinearRegression
import logging
from typing import Callable, List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def _round_clip(val: float, max_val: int) -> int:
    """Rounds a coordinate to the nearest pixel index and clips it inside [0, max_val-1]."""
    return int(np.clip(round(val), 0, max_val - 1))


def _sample_depth_point(xi: int, yi: int, ransac_model, dsm_data: np.ndarray) -> Dict:
    """
    Samples the fitted reference-plane depth at a single pixel.
    ransac_model.predict([[x, y]]) evaluates the same fitted plane z = a*x + b*y + c
    used for the full-mask depth map, so results stay consistent with depth_max/depth_mean.
    """
    z_dsm = float(dsm_data[yi, xi])
    z_ref = float(ransac_model.predict(np.array([[xi, yi]]))[0])
    depth_m = max(0.0, z_ref - z_dsm)
    return {"x": int(xi), "y": int(yi), "kedalaman_cm": round(depth_m * 100.0, 2)}


def compute_validation_points(
    inst_mask: np.ndarray,
    x_pot: np.ndarray,
    y_pot: np.ndarray,
    depth_vals: np.ndarray,
    ransac_model,
    dsm_data: np.ndarray,
    offset_ratio: float = 0.6
) -> Dict[str, Dict]:
    """
    Estimates depth at 5 points per pothole instance (tengah/kiri/kanan/atas/bawah), for comparison
    against manual field measurements taken at the same 5 relative positions.

    "tengah" is the pixel with the DEEPEST computed depth in the mask (i.e. where depth_max_cm comes
    from), not the mask's geometric centroid — this mirrors how a surveyor actually measures a
    pothole in the field: probe the visibly deepest spot first, then its left/right/top/bottom.

    The other 4 points are taken AROUND that deepest point, not from the mask's overall geometric
    extremes: starting at the deepest pixel, walk left/right along its own row and up/down along its
    own column until reaching the mask edge in that exact direction, then place the point at
    `offset_ratio` of that distance (e.g. 0.6 = 60% of the way from the deepest point towards the
    edge). This keeps kiri/kanan/atas/bawah proportional to each pothole's actual size in each
    direction (a small pothole gets points close together, a large one gets them far apart) while
    leaving a margin before the true edge, which tends to read shallower (pothole-to-road transition).

    NOTE (approximation, not ground-truth correspondence): there is no GPS/pixel-precise record of
    where the field measurements were physically taken inside each pothole, so this is a best-effort
    geometric proxy, not an exact spatial match. The offset_ratio value is empirical and should be
    tuned once initial validation results (system vs. field measurements) are available.
    """
    height, width = dsm_data.shape

    # Reference point = the deepest pixel in the mask (same pixel depth_max_cm is derived from).
    deepest_idx = int(np.argmax(depth_vals))
    ref_x, ref_y = float(x_pot[deepest_idx]), float(y_pot[deepest_idx])

    # Distance from the deepest point to the mask edge along its own row (for kiri/kanan) and its
    # own column (for atas/bawah) — i.e. how far the pothole actually extends in each direction from
    # its deepest spot, not the mask's overall bounding extent.
    row_x = x_pot[y_pot == ref_y]
    col_y = y_pot[x_pot == ref_x]
    dist_left = ref_x - row_x.min()
    dist_right = row_x.max() - ref_x
    dist_up = ref_y - col_y.min()
    dist_down = col_y.max() - ref_y

    # Fallback for the (rare, irregular-mask) case where the deepest point already sits on the edge
    # of its own row/column, which would collapse that direction's point onto the deepest point
    # itself — fall back to the mask's overall extent in that direction instead.
    if dist_left <= 0:
        dist_left = ref_x - x_pot.min()
    if dist_right <= 0:
        dist_right = x_pot.max() - ref_x
    if dist_up <= 0:
        dist_up = ref_y - y_pot.min()
    if dist_down <= 0:
        dist_down = y_pot.max() - ref_y

    raw_points = {
        "kiri": (ref_x - offset_ratio * dist_left, ref_y),
        "kanan": (ref_x + offset_ratio * dist_right, ref_y),
        "atas": (ref_x, ref_y - offset_ratio * dist_up),
        "bawah": (ref_x, ref_y + offset_ratio * dist_down),
    }

    validation_points = {}
    for name, (px, py) in raw_points.items():
        xi, yi = _round_clip(px, width), _round_clip(py, height)
        if inst_mask[yi, xi] == 0:
            # Walking outward crossed outside the (possibly non-convex/irregular) mask shape before
            # reaching the intended distance — fall back to the deepest point itself rather than
            # reporting a pixel that isn't actually part of the pothole.
            xi, yi = _round_clip(ref_x, width), _round_clip(ref_y, height)

        validation_points[name] = _sample_depth_point(xi, yi, ransac_model, dsm_data)

    ref_xi, ref_yi = _round_clip(ref_x, width), _round_clip(ref_y, height)
    validation_points["tengah"] = _sample_depth_point(ref_xi, ref_yi, ransac_model, dsm_data)

    return validation_points


def compute_reference_plane_mesh(
    x_pot: np.ndarray,
    y_pot: np.ndarray,
    inst_mask: np.ndarray,
    ransac_model,
    dsm_transform,
    width: int,
    height: int,
    max_grid: int = 28
) -> Optional[Dict[str, list]]:
    """
    Builds a small triangulated surface for the fitted RANSAC reference plane, CLIPPED to the
    pothole's own mask contour (not its bounding box) — so the overlay covers exactly the area the
    depth/volume metrics were computed over, instead of a rectangle that bleeds into good road.

    Method: lay a coarse grid (<= max_grid steps per axis) over the mask's own bbox, keep only grid
    points that land on a mask pixel, then emit a triangle per grid cell where at least 3 of its 4
    corners are inside the mask (a full quad -> 2 triangles, a corner clipped by the mask boundary
    -> 1 triangle from the remaining 3). Vertex Z comes from the SAME fitted plane used for
    depth_max/depth_mean, so the surface is mathematically flat — only its outline follows the mask.

    Returns {"vertices": [[X,Y,Z], ...], "faces": [[i,j,k], ...]} in real-world coordinates
    (via dsm_transform), or None if the mask is too small/thin to form any triangle.

    ASSUMPTION: the uploaded Pix4D mesh (.obj) is georeferenced in the same CRS/coordinate origin
    as the orthomosaic & DSM this plane was fit from — true for a standard Pix4D export of the same
    survey, but not guaranteed in general (e.g. a mesh exported with a local/relative origin).
    """
    x_min, x_max = int(x_pot.min()), int(x_pot.max())
    y_min, y_max = int(y_pot.min()), int(y_pot.max())
    step_x = max(1, -(-(x_max - x_min) // max_grid))  # ceil division
    step_y = max(1, -(-(y_max - y_min) // max_grid))

    xs = list(range(x_min, x_max + 1, step_x))
    if xs[-1] != x_max:
        xs.append(x_max)
    ys = list(range(y_min, y_max + 1, step_y))
    if ys[-1] != y_max:
        ys.append(y_max)
    nx, ny = len(xs), len(ys)

    vertex_id = -np.ones((ny, nx), dtype=int)
    vertices_px = []
    for j, gy in enumerate(ys):
        for i, gx in enumerate(xs):
            gx_c, gy_c = min(max(gx, 0), width - 1), min(max(gy, 0), height - 1)
            if inst_mask[gy_c, gx_c] > 0:
                vertex_id[j, i] = len(vertices_px)
                vertices_px.append((gx, gy))

    if len(vertices_px) < 3:
        return None

    z_vals = ransac_model.predict(np.array(vertices_px))
    vertices_world = []
    for (px_, py_), z in zip(vertices_px, z_vals):
        world_x, world_y = dsm_transform * (px_, py_)
        vertices_world.append([float(world_x), float(world_y), float(z)])

    faces = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a, b, c, d = vertex_id[j, i], vertex_id[j, i+1], vertex_id[j+1, i], vertex_id[j+1, i+1]
            corners = [a, b, c, d]
            n_inside = sum(1 for v in corners if v >= 0)
            if n_inside == 4:
                faces.append([int(a), int(c), int(b)])
                faces.append([int(b), int(c), int(d)])
            elif n_inside == 3:
                faces.append([int(v) for v in corners if v >= 0])

    if not faces:
        return None

    return {"vertices": vertices_world, "faces": faces}


def compute_depth_and_volume(
    dsm_path: str,
    instance_mask_map: np.ndarray,
    instances: List[Dict],
    gsd_m: float,
    buffer_px: int = 15,
    offset_ratio: float = 0.6,
    on_progress: Optional[Callable[[int, int, str], None]] = None
) -> Tuple[np.ndarray, List[Dict]]:
    """
    Computes pothole depth map and volumetric metrics via RANSAC 3D Plane Fitting.
    - Fits reference road surface plane z = a*x + b*y + c using surrounding ring buffer pixels.
    - Pothole depth = z_plane(x,y) - z_DSM(x,y).
    - Area = num_pixels * (GSD_m ^ 2)
    - Volume = sum(depth_i) * (GSD_m ^ 2)

    on_progress(instance_index, total_instances, message), if given, is called once per pothole
    instance right after its RANSAC fit is done — so the caller (the job runner) can surface live,
    per-pothole RANSAC status (ring size, RANSAC trial/inlier count, resulting depth) instead of a
    single opaque "processing..." stage for the whole batch.
    """
    with rasterio.open(dsm_path) as src:
        dsm_data = src.read(1).astype(np.float32)
        dsm_transform = src.transform  # pixel (col,row) -> real-world (X,Y) in the DSM's CRS

    height, width = dsm_data.shape
    depth_heatmap = np.zeros((height, width), dtype=np.float32)
    pothole_metrics = []
    total_instances = len(instances)

    for inst_index, inst in enumerate(instances, start=1):
        inst_id = inst["instance_id"]
        inst_mask = (instance_mask_map == inst_id).astype(np.uint8)

        # Morphological dilation to create reference road surface ring buffer
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (buffer_px * 2 + 1, buffer_px * 2 + 1))
        dilated_mask = cv2.dilate(inst_mask, kernel, iterations=1)
        ring_mask = (dilated_mask == 1) & (inst_mask == 0)

        # Get coordinates and elevations for ring reference pixels
        ring_coords = np.argwhere(ring_mask > 0)  # [y, x]
        if len(ring_coords) < 6:
            # Fallback if ring buffer has too few pixels
            ring_coords = np.argwhere(dilated_mask > 0)

        # Prepare X, Y features and Z target for 3D RANSAC plane fitting
        y_ring, x_ring = ring_coords[:, 0], ring_coords[:, 1]
        z_ring = dsm_data[y_ring, x_ring]

        # Exclude NaN or infinity elevation values
        valid_idx = np.isfinite(z_ring)
        if np.sum(valid_idx) < 3:
            logger.warning(f"Insufficient valid DSM values for pothole instance #{inst_id}")
            continue

        x_valid = x_ring[valid_idx]
        y_valid = y_ring[valid_idx]
        z_valid = z_ring[valid_idx]

        X_ref = np.column_stack((x_valid, y_valid))

        n_ring_points = len(z_valid)
        ransac_trials = None
        ransac_inliers = None
        try:
            # RANSAC Plane Fitting
            ransac = RANSACRegressor(estimator=LinearRegression(), residual_threshold=0.01, random_state=42)
            ransac.fit(X_ref, z_valid)
            # n_trials_ / inlier_mask_ reflect what RANSAC actually did on THIS instance's ring —
            # surfaced via on_progress below so the caller can show real fitting stats, not a guess.
            ransac_trials = int(getattr(ransac, "n_trials_", 0)) or None
            if hasattr(ransac, "inlier_mask_"):
                ransac_inliers = int(np.sum(ransac.inlier_mask_))
        except Exception as e:
            # Fallback to standard linear regression if RANSAC fails
            ransac = LinearRegression()
            ransac.fit(X_ref, z_valid)

        # Get coordinates inside pothole mask
        pothole_coords = np.argwhere(inst_mask > 0)
        y_pot, x_pot = pothole_coords[:, 0], pothole_coords[:, 1]
        z_pot_dsm = dsm_data[y_pot, x_pot]

        X_pot = np.column_stack((x_pot, y_pot))
        z_plane_predicted = ransac.predict(X_pot)

        # Pothole depth = plane elevation - DSM elevation
        depth_vals = z_plane_predicted - z_pot_dsm
        # Clip negative depths (where DSM elevation is above reference plane due to noise)
        depth_vals = np.maximum(0.0, depth_vals)

        # Store depth values into overall heatmap
        depth_heatmap[y_pot, x_pot] = depth_vals

        # Validation module: depth at 5 fixed geometric points (tengah/kiri/kanan/atas/bawah),
        # reusing the same fitted RANSAC plane — for comparison against manual field measurements
        # taken at the same 5 relative positions. Runs alongside the existing depth_max/mean
        # aggregation without altering it.
        titik_validasi = compute_validation_points(
            inst_mask=inst_mask,
            x_pot=x_pot,
            y_pot=y_pot,
            depth_vals=depth_vals,
            ransac_model=ransac,
            dsm_data=dsm_data,
            offset_ratio=offset_ratio
        )

        # Reference-plane surface (real-world X/Y/Z vertices + triangle faces), clipped to this
        # pothole's own mask contour, for overlaying the fitted RANSAC plane inside the 3D mesh
        # viewer — see compute_reference_plane_mesh for the georeferencing assumption this relies on.
        reference_plane_mesh = compute_reference_plane_mesh(
            x_pot=x_pot,
            y_pot=y_pot,
            inst_mask=inst_mask,
            ransac_model=ransac,
            dsm_transform=dsm_transform,
            width=width,
            height=height
        )

        # Metrics calculation
        depth_max_m = float(np.max(depth_vals)) if len(depth_vals) > 0 else 0.0
        depth_mean_m = float(np.mean(depth_vals)) if len(depth_vals) > 0 else 0.0
        depth_max_cm = float(depth_max_m * 100.0)
        depth_mean_cm = float(depth_mean_m * 100.0)

        pixel_area_m2 = gsd_m * gsd_m
        area_m2 = float(len(depth_vals) * pixel_area_m2)
        volume_m3 = float(np.sum(depth_vals) * pixel_area_m2)

        # Extract per-point depth values with smart uniform downsampling for UI performance
        total_n_pixels = len(depth_vals)
        MAX_UI_POINTS = 5000
        if total_n_pixels > MAX_UI_POINTS:
            stride = max(1, total_n_pixels // MAX_UI_POINTS)
            sampled_indices = list(range(0, total_n_pixels, stride))[:MAX_UI_POINTS]
            is_downsampled = True
        else:
            sampled_indices = list(range(total_n_pixels))
            is_downsampled = False

        depth_points_cm = [round(float(depth_vals[i] * 100.0), 2) for i in sampled_indices]
        depth_points_detail = [
            {
                "point_id": i + 1,
                "x": int(pothole_coords[i][1]),
                "y": int(pothole_coords[i][0]),
                "depth_cm": round(float(depth_vals[i] * 100.0), 2)
            }
            for i in sampled_indices
        ]

        pothole_metrics.append({
            "instance_id": inst_id,
            "depth_max_cm": round(depth_max_cm, 2),
            "depth_max_m": round(depth_max_m, 4),
            "depth_mean_cm": round(depth_mean_cm, 2),
            "depth_mean_m": round(depth_mean_m, 4),
            "area_m2": round(area_m2, 4),
            "volume_m3": round(volume_m3, 6),
            "n_points": total_n_pixels,
            "is_downsampled": is_downsampled,
            "depth_points_cm": depth_points_cm,
            "depth_points_detail": depth_points_detail,
            "titik_validasi": titik_validasi,
            "reference_plane_mesh": reference_plane_mesh,
            "confidence": inst.get("confidence"),
            "bbox": inst["bbox"]
        })

        if on_progress:
            trials_str = str(ransac_trials) if ransac_trials is not None else "-"
            inliers_str = f"{ransac_inliers}/{n_ring_points}" if ransac_inliers is not None else f"{n_ring_points}/{n_ring_points}"
            message = (
                f"Lubang {inst_index}/{total_instances} (#{inst_id}): {n_ring_points} titik cincin referensi, "
                f"{trials_str} percobaan RANSAC, {inliers_str} inlier -> "
                f"kedalaman maks {depth_max_cm:.1f} cm, volume {volume_m3:.4f} m3"
            )
            on_progress(inst_index, total_instances, message)

    logger.info(f"Depth calculation complete for {len(pothole_metrics)} potholes.")
    return depth_heatmap, pothole_metrics
