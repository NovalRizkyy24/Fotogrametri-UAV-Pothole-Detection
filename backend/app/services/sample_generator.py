import numpy as np
import cv2
import rasterio
from rasterio.transform import from_origin
from pathlib import Path
import logging
from backend.app.config import SAMPLE_DIR

logger = logging.getLogger(__name__)

def generate_sample_dataset() -> tuple[Path, Path]:
    """
    Generates synthetic sample GeoTIFF files for instant demonstration:
    - sample_orthomosaic.tif (RGB road with asphalt texture & potholes)
    - sample_dsm.tif (Elevation raster with pothole depressions)
    Returns (ortho_path, dsm_path).
    """
    ortho_path = SAMPLE_DIR / "sample_orthomosaic.tif"
    dsm_path = SAMPLE_DIR / "sample_dsm.tif"

    if ortho_path.exists() and dsm_path.exists():
        return ortho_path, dsm_path

    logger.info("Generating synthetic sample GeoTIFF dataset...")
    width, height = 800, 800
    gsd_m = 0.02  # 2 cm per pixel resolution

    # Base Asphalt Road RGB Image
    np.random.seed(42)
    noise = np.random.normal(120, 15, (height, width)).astype(np.uint8)
    asphalt_rgb = cv2.merge([noise, noise, noise])

    # Draw Road Markings (White lane lines)
    cv2.line(asphalt_rgb, (400, 0), (400, height), (240, 240, 240), 8)

    # Base Elevation DSM (Road with 1% slope)
    y_coords, x_coords = np.indices((height, width))
    base_elevation = 15.0 + 0.001 * x_coords - 0.002 * y_coords

    # Synthetic Pothole locations & depths (in meters)
    potholes = [
        {"cx": 250, "cy": 300, "rx": 35, "ry": 25, "depth_m": 0.065}, # 6.5 cm (Berat)
        {"cx": 550, "cy": 200, "rx": 25, "ry": 30, "depth_m": 0.035}, # 3.5 cm (Sedang)
        {"cx": 350, "cy": 600, "rx": 20, "ry": 20, "depth_m": 0.015}, # 1.5 cm (Ringan)
    ]

    for p in potholes:
        cx, cy, rx, ry, depth = p["cx"], p["cy"], p["rx"], p["ry"], p["depth_m"]
        
        # Distance map normalized
        dist = (((x_coords - cx) / rx) ** 2 + ((y_coords - cy) / ry) ** 2)
        mask = dist <= 1.0

        # Depress DSM elevation inside pothole (parabolic bowl shape)
        depression = depth * (1.0 - dist)
        depression[~mask] = 0.0
        base_elevation -= depression

        # Darken asphalt texture inside pothole in RGB image
        asphalt_rgb[mask] = (asphalt_rgb[mask] * 0.4).astype(np.uint8)
        # Add rough inner border contour in RGB
        cv2.ellipse(asphalt_rgb, (cx, cy), (rx, ry), 0, 0, 360, (40, 40, 40), 3)

    # Georeferencing metadata (UTM 48S / WGS84 coordinates)
    transform = from_origin(700000.0, 9200000.0, gsd_m, gsd_m)

    # Write Orthomosaic GeoTIFF
    ortho_meta = {
        'driver': 'GTiff',
        'height': height,
        'width': width,
        'count': 3,
        'dtype': 'uint8',
        'crs': 'EPSG:32748',
        'transform': transform,
    }
    with rasterio.open(ortho_path, 'w', **ortho_meta) as dst:
        dst.write(asphalt_rgb[:, :, 0], 1)
        dst.write(asphalt_rgb[:, :, 1], 2)
        dst.write(asphalt_rgb[:, :, 2], 3)

    # Write DSM GeoTIFF
    dsm_meta = {
        'driver': 'GTiff',
        'height': height,
        'width': width,
        'count': 1,
        'dtype': 'float32',
        'crs': 'EPSG:32748',
        'transform': transform,
    }
    with rasterio.open(dsm_path, 'w', **dsm_meta) as dst:
        dst.write(base_elevation.astype(np.float32), 1)

    logger.info(f"Sample dataset created at {SAMPLE_DIR}")
    return ortho_path, dsm_path
