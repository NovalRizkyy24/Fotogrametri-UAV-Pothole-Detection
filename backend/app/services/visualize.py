import cv2
import numpy as np
import rasterio
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import logging
from pathlib import Path
from typing import List, Dict

logger = logging.getLogger(__name__)

def generate_visualization_images(
    ortho_path: str,
    instance_mask_map: np.ndarray,
    depth_heatmap: np.ndarray,
    metrics: List[Dict],
    output_dir: Path
) -> Dict[str, str]:
    """
    Generates high quality PNG images:
    1. orthomosaic.png - RGB original image
    2. overlay.png - Bounding boxes, detection contours, colored mask overlays,
       ID/depth/confidence labels, and the 5 validation points
    2b. overlay_no_points.png - bbox + contours + colored mask fill only, with no labels, no
        confidence, and no validation points, so the frontend's single toggle hides all of that
        together
    3. heatmap.png - Pothole depth colormap with colorbar
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    with rasterio.open(ortho_path) as src:
        if src.count >= 3:
            rgb = src.read([1, 2, 3])
            img_rgb = np.transpose(rgb, (1, 2, 0))
        else:
            data = src.read(1)
            img_rgb = cv2.cvtColor(data, cv2.COLOR_GRAY2RGB)

    if img_rgb.dtype != np.uint8:
        img_min, img_max = img_rgb.min(), img_rgb.max()
        if img_max > img_min:
            img_rgb = ((img_rgb - img_min) / (img_max - img_min) * 255).astype(np.uint8)
        else:
            img_rgb = np.zeros_like(img_rgb, dtype=np.uint8)

    height, width = instance_mask_map.shape

    # 1. Save Original Orthomosaic PNG
    ortho_png_path = output_dir / "orthomosaic.png"
    cv2.imwrite(str(ortho_png_path), cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))

    # 2. Generate Detection Overlay PNG
    overlay_img = img_rgb.copy()
    mask_layer = np.zeros_like(img_rgb)
    
    # Distinct color palette per pothole ID
    palette = [
        (255, 59, 48),    # Red
        (255, 149, 0),   # Orange
        (255, 204, 0),   # Yellow
        (52, 199, 89),    # Green
        (0, 199, 190),   # Cyan
        (48, 176, 255),  # Blue
        (175, 82, 222),  # Purple
    ]

    # Marker label + fixed pixel offset (so labels of adjacent points don't stack on the dot)
    VALIDATION_POINT_STYLE = {
        "tengah": ("T", (0, -14)),
        "kiri": ("Ki", (-10, 4)),
        "kanan": ("Ka", (10, 4)),
        "atas": ("A", (0, -14)),
        "bawah": ("B", (0, 20)),
    }
    VALIDATION_DOT_COLOR = (255, 0, 220)  # magenta — distinct from the instance color palette

    # Pass 1: bbox + contours + colored mask fill only (no text yet) — shared by both output variants.
    # The bounding box is drawn alongside the mask contour so the two can be visually compared — e.g.
    # to check whether an odd-looking mask shape is a genuine model output or a processing artifact.
    for metric in metrics:
        inst_id = metric["instance_id"]
        color = palette[(inst_id - 1) % len(palette)]
        mask_bool = (instance_mask_map == inst_id)

        mask_layer[mask_bool] = color

        bbox = metric["bbox"]
        cv2.rectangle(overlay_img, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2, lineType=cv2.LINE_AA)

        contours, _ = cv2.findContours((mask_bool).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay_img, contours, -1, color, 3, lineType=cv2.LINE_AA)

    blend_overlay_base = cv2.addWeighted(overlay_img, 0.7, mask_layer, 0.3, 0)

    def draw_id_label(target_img, metric):
        """Draws the '#N (depth, confidence)' badge near the top-left of the instance's bbox."""
        inst_id = metric["instance_id"]
        bbox = metric["bbox"]
        label_x, label_y = bbox[0], max(bbox[1] - 10, 18)
        conf = metric.get("confidence")
        conf_str = f", {conf * 100:.0f}%" if conf is not None else ""
        label_str = f"#{inst_id} ({metric['depth_max_cm']}cm{conf_str})"

        (tw, th), _ = cv2.getTextSize(label_str, cv2.FONT_HERSHEY_SIMPLEX, 2.5, 8)
        cv2.rectangle(target_img, (label_x - 10, label_y - th - 15), (label_x + tw + 10, label_y + 10), (0, 0, 0), -1)
        cv2.putText(target_img, label_str, (label_x, label_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 2.5, (255, 255, 255), 8, cv2.LINE_AA)

    # "No points" variant: contours + colored mask fill only — no ID/depth label, no confidence,
    # no validation points. The frontend's "Titik Validasi" toggle hides all of that together.
    blend_overlay_clean = blend_overlay_base.copy()

    overlay_clean_path = output_dir / "overlay_no_points.png"
    cv2.imwrite(str(overlay_clean_path), cv2.cvtColor(blend_overlay_clean, cv2.COLOR_RGB2BGR))

    # "With points" variant: ID + depth + confidence label, plus the 5 geometric validation points
    # (tengah/kiri/kanan/atas/bawah) and their legend.
    blend_overlay_points = blend_overlay_base.copy()
    for metric in metrics:
        draw_id_label(blend_overlay_points, metric)

        validation_points = metric.get("titik_validasi") or {}
        for key, pt in validation_points.items():
            label, (dx, dy) = VALIDATION_POINT_STYLE.get(key, (key[:1].upper(), (0, -10)))
            px, py = int(pt["x"]), int(pt["y"])

            cv2.circle(blend_overlay_points, (px, py), 18, (0, 0, 0), -1)
            cv2.circle(blend_overlay_points, (px, py), 18, VALIDATION_DOT_COLOR, 3)
            cv2.circle(blend_overlay_points, (px, py), 8, VALIDATION_DOT_COLOR, -1)

            tag = f"{label}:{pt['kedalaman_cm']}cm"
            (ttw, tth), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 1.5, 5)
            tag_x, tag_y = px + dx * 3 - ttw // 2, py + dy * 3
            cv2.rectangle(blend_overlay_points, (tag_x - 8, tag_y - tth - 10), (tag_x + ttw + 8, tag_y + 10), (0, 0, 0), -1)
            cv2.putText(blend_overlay_points, tag, (tag_x, tag_y), cv2.FONT_HERSHEY_SIMPLEX, 1.5, VALIDATION_DOT_COLOR, 5, cv2.LINE_AA)

    # Legend for the validation point markers (drawn once, bottom-left corner)
    legend_text = "* Titik Validasi (T=Tengah Ki=Kiri Ka=Kanan A=Atas B=Bawah)"
    (ltw, lth), _ = cv2.getTextSize(legend_text, cv2.FONT_HERSHEY_SIMPLEX, 1.9, 5)
    cv2.rectangle(blend_overlay_points, (10, height - lth - 32), (10 + ltw + 32, height - 10), (0, 0, 0), -1)
    cv2.circle(blend_overlay_points, (30, height - 21), 10, VALIDATION_DOT_COLOR, -1)
    cv2.putText(blend_overlay_points, legend_text, (50, height - 16), cv2.FONT_HERSHEY_SIMPLEX, 1.9, (255, 255, 255), 5, cv2.LINE_AA)

    overlay_png_path = output_dir / "overlay.png"
    cv2.imwrite(str(overlay_png_path), cv2.cvtColor(blend_overlay_points, cv2.COLOR_RGB2BGR))

    # 3. Generate Depth Heatmap PNG with Matplotlib Colorbar
    heatmap_cm = depth_heatmap * 100.0  # Convert depth to cm
    max_depth_cm = float(np.max(heatmap_cm)) if np.max(heatmap_cm) > 0 else 1.0

    # Calculate dynamic figure size matching image aspect ratio
    aspect_ratio = width / float(height) if height > 0 else 1.0
    if aspect_ratio < 1.0: # Tall portrait image
        fig_width = 10.0
        fig_height = min(16.0, max(8.0, 10.0 / aspect_ratio))
    else: # Wide landscape image
        fig_height = 10.0
        fig_width = min(16.0, max(8.0, 10.0 * aspect_ratio))

    fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=150)
    ax.imshow(img_rgb)
    
    # Mask zero depth pixels so orthomosaic shows underneath
    heatmap_masked = np.ma.masked_where(heatmap_cm <= 0.05, heatmap_cm)
    
    vmax_val = max(5.0, float(max_depth_cm))
    im = ax.imshow(heatmap_masked, cmap='turbo', alpha=0.85, vmin=0, vmax=vmax_val)
    
    # Colorbar legend styling (prominent, large, readable)
    cbar = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.03, shrink=0.75)
    cbar.set_label('Kedalaman Lubang Jalan (cm)', rotation=270, labelpad=25, fontsize=14, fontweight='bold', color='white')
    cbar.ax.tick_params(labelsize=12, labelcolor='white')
    cbar.outline.set_edgecolor('white')
    cbar.outline.set_linewidth(1.5)

    ax.set_title("Peta Kedalaman (Depth Heatmap)", fontsize=16, fontweight='bold', color='white', pad=12)
    ax.axis('off')
    
    fig.patch.set_facecolor('#050811')
    ax.set_facecolor('#050811')
    plt.tight_layout()

    heatmap_png_path = output_dir / "heatmap.png"
    plt.savefig(str(heatmap_png_path), bbox_inches='tight', dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)

    logger.info("Visualizations generated successfully.")
    return {
        "orthomosaic": f"/storage/results/{output_dir.name}/orthomosaic.png",
        "overlay": f"/storage/results/{output_dir.name}/overlay.png",
        "overlay_no_points": f"/storage/results/{output_dir.name}/overlay_no_points.png",
        "heatmap": f"/storage/results/{output_dir.name}/heatmap.png"
    }
