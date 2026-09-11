import numpy as np
import cv2
from pathlib import Path
import logging
from backend.app.config import SAMPLE_DIR

logger = logging.getLogger(__name__)

def generate_sample_mesh() -> tuple[Path, Path, Path]:
    """
    Generates a synthetic 3D road surface mesh (.obj, .mtl, .jpg) for instant 3D demonstration.
    Returns (obj_path, mtl_path, texture_path).
    """
    obj_path = SAMPLE_DIR / "sample_mesh.obj"
    mtl_path = SAMPLE_DIR / "sample_mesh.mtl"
    texture_path = SAMPLE_DIR / "sample_texture.jpg"

    if obj_path.exists() and mtl_path.exists() and texture_path.exists():
        return obj_path, mtl_path, texture_path

    logger.info("Generating synthetic 3D road surface mesh sample...")
    
    # 1. Generate Asphalt Texture JPG image (512x512)
    np.random.seed(42)
    noise = np.random.normal(120, 15, (512, 512)).astype(np.uint8)
    asphalt_rgb = cv2.merge([noise, noise, noise])
    # Draw yellow centerline
    cv2.line(asphalt_rgb, (256, 0), (256, 512), (0, 210, 255), 10)
    # Darken pothole areas
    cv2.circle(asphalt_rgb, (160, 200), 40, (30, 30, 30), -1)
    cv2.circle(asphalt_rgb, (350, 320), 30, (40, 40, 40), -1)
    cv2.imwrite(str(texture_path), asphalt_rgb)

    # 2. Generate MTL file
    mtl_content = f"""# Synthetic 3D Road Surface Material
newmtl RoadMaterial
Ka 1.000000 1.000000 1.000000
Kd 1.000000 1.000000 1.000000
Ks 0.100000 0.100000 0.100000
Ns 10.000000
map_Kd {texture_path.name}
"""
    with open(mtl_path, "w") as f:
        f.write(mtl_content)

    # 3. Generate OBJ 3D Mesh file (Grid of 40x40 vertices with pothole depressions)
    grid_size = 40
    scale = 0.2
    vertices = []
    uvs = []
    faces = []

    for i in range(grid_size):
        for j in range(grid_size):
            x = (j - grid_size / 2) * scale
            y = (i - grid_size / 2) * scale
            u = j / (grid_size - 1)
            v = 1.0 - (i / (grid_size - 1))

            # Base elevation + pothole depression Z calculation
            z = 0.0
            # Pothole 1
            d1 = np.sqrt((x - (-1.5))**2 + (y - (-1.0))**2)
            if d1 < 0.8:
                z -= 0.35 * (1.0 - (d1 / 0.8)**2)
            # Pothole 2
            d2 = np.sqrt((x - 1.2)**2 + (y - 0.5)**2)
            if d2 < 0.6:
                z -= 0.25 * (1.0 - (d2 / 0.6)**2)

            vertices.append((x, z, y)) # Swapped Y/Z for standard 3D upright orientation
            uvs.append((u, v))

    for i in range(grid_size - 1):
        for j in range(grid_size - 1):
            v1 = i * grid_size + j + 1
            v2 = v1 + 1
            v3 = (i + 1) * grid_size + j + 1
            v4 = v3 + 1

            # Two triangles per grid cell (v/vt)
            faces.append(f"f {v1}/{v1} {v3}/{v3} {v2}/{v2}")
            faces.append(f"f {v2}/{v2} {v3}/{v3} {v4}/{v4}")

    with open(obj_path, "w") as f:
        f.write(f"mtllib {mtl_path.name}\n")
        f.write("g RoadSurface\n")
        f.write("usemtl RoadMaterial\n")
        for v in vertices:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for vt in uvs:
            f.write(f"vt {vt[0]:.4f} {vt[1]:.4f}\n")
        for fc in faces:
            f.write(f"{fc}\n")

    logger.info("Sample 3D Mesh created successfully.")
    return obj_path, mtl_path, texture_path
