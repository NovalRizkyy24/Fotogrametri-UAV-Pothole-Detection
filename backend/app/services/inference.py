import cv2
import numpy as np
import rasterio
from ultralytics import YOLO
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

def run_pothole_detection(
    ortho_path: str,
    model_path: str,
    conf_threshold: float = 0.25
) -> Tuple[np.ndarray, List[Dict]]:
    """
    Runs YOLOv8-seg detection directly on full resolution orthomosaic image (without tiling).
    Returns:
      - instance_mask_map: 2D integer numpy array where pixel values correspond to pothole instance ID (1..N), 0 for background.
      - detected_instances: list of dicts with instance_id, bbox, area_px.
    """
    logger.info(f"Loading YOLOv8 model from {model_path}...")
    model = YOLO(model_path)

    with rasterio.open(ortho_path) as src:
        height = src.height
        width = src.width
        # Read RGB channels
        if src.count >= 3:
            rgb_data = src.read([1, 2, 3])
            img_rgb = np.transpose(rgb_data, (1, 2, 0))
        else:
            data = src.read(1)
            img_rgb = cv2.cvtColor(data, cv2.COLOR_GRAY2RGB)

    # Ensure 8-bit unsigned uint8 format for YOLO
    if img_rgb.dtype != np.uint8:
        img_min, img_max = img_rgb.min(), img_rgb.max()
        if img_max > img_min:
            img_rgb = ((img_rgb - img_min) / (img_max - img_min) * 255).astype(np.uint8)
        else:
            img_rgb = np.zeros_like(img_rgb, dtype=np.uint8)

    accumulated_binary_mask = np.zeros((height, width), dtype=np.uint8)

    # Keep each raw prediction's mask + confidence around so it can be matched back to whichever
    # connected-component instance it ends up contributing to.
    raw_predictions = []  # list of (binary_mask, confidence)

    # Directly run YOLOv8 prediction on full orthomosaic image.
    # retina_masks=True makes Ultralytics unletterbox/rescale masks itself (ops.process_mask_native)
    # straight to the original image's (height, width) — masks.data then already matches img_rgb's
    # shape exactly. Without it (the previous default), masks come back sized to the model's padded
    # letterbox input canvas (e.g. 800x736) instead of the orthomosaic's own aspect ratio (e.g.
    # 3420x3079), and naively cv2.resize-ing that mismatched-aspect-ratio canvas onto the full
    # orthomosaic stretched it non-uniformly on X vs Y — the source of the corner misalignment
    # (parts of a pothole left uncovered on one side, extra area bleeding in on the opposite side).
    logger.info(f"Running YOLOv8 prediction directly on full image ({width}x{height})...")
    results = model.predict(img_rgb, conf=conf_threshold, retina_masks=True, verbose=False)

    for res in results:
        if res.masks is not None:
            masks_data = res.masks.data.cpu().numpy()  # (N, H, W), already at (height, width) and binary
            confs = res.boxes.conf.cpu().numpy() if res.boxes is not None else np.zeros(len(masks_data))
            for mask, conf in zip(masks_data, confs):
                # Safety net: retina_masks should already deliver masks at (height, width), but if a
                # future Ultralytics version ever changes that contract, fall back to resizing rather
                # than silently misaligning or crashing on a shape mismatch downstream.
                if mask.shape != (height, width):
                    mask = cv2.resize(mask.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
                binary_mask = (mask > 0.5).astype(np.uint8)

                # Light morphological smoothing: close small gaps, then open to drop stray
                # single-pixel noise — cleans up residual jaggedness without changing the mask's
                # overall shape/area in any meaningful way.
                smooth_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, smooth_kernel)
                binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_OPEN, smooth_kernel)
                binary_mask = binary_mask.astype(bool)

                accumulated_binary_mask[binary_mask] = 1
                raw_predictions.append((binary_mask, float(conf)))

    # Extract unique instance IDs via Connected Components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(accumulated_binary_mask, connectivity=8)

    instance_mask_map = np.zeros((height, width), dtype=np.int32)
    detected_instances = []
    current_id = 1

    for label_idx in range(1, num_labels):
        area_px = stats[label_idx, cv2.CC_STAT_AREA]
        if area_px < 50:  # Noise threshold
            continue

        x = stats[label_idx, cv2.CC_STAT_LEFT]
        y = stats[label_idx, cv2.CC_STAT_TOP]
        w = stats[label_idx, cv2.CC_STAT_WIDTH]
        h = stats[label_idx, cv2.CC_STAT_HEIGHT]

        instance_mask_map[labels == label_idx] = current_id

        # A merged instance can be made up of one or more overlapping raw predictions (e.g. two
        # tiles/passes covering the same pothole); report the confidence of whichever raw prediction
        # overlaps this instance the most, since that mask contributed most of its pixels.
        instance_pixels = (labels == label_idx)
        confidence = 0.0
        best_overlap = 0
        for binary_mask, conf in raw_predictions:
            overlap = np.count_nonzero(binary_mask & instance_pixels)
            if overlap > best_overlap:
                best_overlap = overlap
                confidence = conf

        detected_instances.append({
            "instance_id": current_id,
            "bbox": [int(x), int(y), int(x + w), int(y + h)],
            "area_px": int(area_px),
            "confidence": round(confidence, 4)
        })
        current_id += 1

    logger.info(f"Detection completed without tiling. Total potholes found: {len(detected_instances)}")
    return instance_mask_map, detected_instances
