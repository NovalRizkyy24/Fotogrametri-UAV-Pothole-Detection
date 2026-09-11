import rasterio
from rasterio.warp import reproject, Resampling
import numpy as np
import os
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def validate_and_align_geotiffs(ortho_path: str, dsm_path: str, aligned_dsm_out_path: str) -> dict:
    """
    Validates CRS, resolution, and dimensions of Orthomosaic and DSM.
    If dimensions/res differ, resamples DSM to strictly match Orthomosaic grid.
    Returns metadata dict including GSD (Ground Sampling Distance in meters).
    """
    with rasterio.open(ortho_path) as ortho_ds:
        ortho_crs = ortho_ds.crs
        ortho_res = ortho_ds.res
        ortho_width = ortho_ds.width
        ortho_height = ortho_ds.height
        ortho_bounds = ortho_ds.bounds
        ortho_transform = ortho_ds.transform

    with rasterio.open(dsm_path) as dsm_ds:
        dsm_crs = dsm_ds.crs
        dsm_res = dsm_ds.res
        dsm_width = dsm_ds.width
        dsm_height = dsm_ds.height

    # Estimate GSD in meters
    # If CRS is projected (e.g. UTM), res is in meters. If geographic, estimate roughly or fallback to res.
    gsd_x, gsd_y = abs(ortho_res[0]), abs(ortho_res[1])
    if ortho_crs and ortho_crs.is_geographic:
        # Convert lat/lon degrees to meters approximately at latitude
        lat = (ortho_bounds.bottom + ortho_bounds.top) / 2.0
        meters_per_deg_lat = 111132.92
        meters_per_deg_lon = 111412.84 * np.cos(np.radians(lat))
        gsd_m = float((gsd_x * meters_per_deg_lon + gsd_y * meters_per_deg_lat) / 2.0)
    else:
        gsd_m = float((gsd_x + gsd_y) / 2.0)

    logger.info(f"Orthomosaic dimensions: {ortho_width}x{ortho_height}, GSD: {gsd_m:.4f}m")

    # If dimensions and transforms match exactly, copy dsm directly or use as is
    if (ortho_width == dsm_width and ortho_height == dsm_height and 
        ortho_crs == dsm_crs and ortho_transform == dsm_ds.transform):
        # Already perfectly aligned
        with rasterio.open(dsm_path) as src:
            dsm_data = src.read(1)
            meta = src.meta.copy()
        
        meta.update({
            "height": ortho_height,
            "width": ortho_width,
            "transform": ortho_transform,
            "crs": ortho_crs
        })
        with rasterio.open(aligned_dsm_out_path, "w", **meta) as dst:
            dst.write(dsm_data, 1)
    else:
        # Reproject / Resample DSM to align strictly with Orthomosaic grid
        logger.info("Resampling & aligning DSM to Orthomosaic geometry...")
        with rasterio.open(dsm_path) as dsm_src:
            dsm_data = dsm_src.read(1)
            destination = np.zeros((ortho_height, ortho_width), dtype=np.float32)

            reproject(
                source=dsm_data,
                destination=destination,
                src_transform=dsm_src.transform,
                src_crs=dsm_src.crs,
                dst_transform=ortho_transform,
                dst_crs=ortho_crs,
                resampling=Resampling.bilinear
            )

            kwargs = dsm_src.meta.copy()
            kwargs.update({
                'crs': ortho_crs,
                'transform': ortho_transform,
                'width': ortho_width,
                'height': ortho_height,
                'dtype': 'float32',
                'count': 1
            })

            with rasterio.open(aligned_dsm_out_path, 'w', **kwargs) as dst:
                dst.write(destination, 1)

    return {
        "width": ortho_width,
        "height": ortho_height,
        "gsd_m": gsd_m,
        "crs": str(ortho_crs)
    }
