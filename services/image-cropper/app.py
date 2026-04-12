"""
Smart Screenshot Cropper - Service FastAPI
Extraction d'image produit depuis des captures d'écran de posts Facebook/Instagram

Stratégie: Pure OpenCV (0 coût, ~5ms par image)
"""

import base64
import os
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

app = FastAPI(
    title="Image Cropper Service",
    description="Smart screenshot cropping using OpenCV",
    version="2.0.0",
)


# ============================================================
# MODELS
# ============================================================


class CropResult(BaseModel):
    success: bool
    image_base64: str
    width: int
    height: int
    method: str
    crop_coordinates: dict
    confidence: Optional[float] = None


# ============================================================
# OPENCV CROPPING FUNCTIONS
# ============================================================


def _find_contiguous_blocks(mask: np.ndarray) -> list:
    """Trouve les blocs contigus de True dans un tableau booléen."""
    blocks = []
    transitions = np.diff(mask.astype(int))
    starts = np.where(transitions == 1)[0] + 1
    ends = np.where(transitions == -1)[0]

    if mask[0]:
        starts = np.insert(starts, 0, 0)
    if mask[-1]:
        ends = np.append(ends, len(mask) - 1)

    for s, e in zip(starts, ends):
        if e > s:
            blocks.append((s, e))

    return blocks


def _trim_overlay_bars(
    img: np.ndarray, gray: np.ndarray, y_start: int, y_end: int, scan_height: int = 80
) -> int:
    """
    Détecte et exclut les barres overlay en bas de l'image
    (ex: barre jaune "NON DISCUTABLE", barre "Shop photo").
    """
    hsv = cv2.cvtColor(
        img[max(y_start, y_end - scan_height) : y_end, :], cv2.COLOR_BGR2HSV
    )

    for i in range(hsv.shape[0] - 1, -1, -1):
        row_saturation = np.mean(hsv[i, :, 1])
        row_brightness = np.mean(gray[y_end - (hsv.shape[0] - i), :])

        if row_saturation < 120 and row_brightness < 230:
            actual_row = y_end - (hsv.shape[0] - i) + 1

            if (actual_row - y_start) > (y_end - y_start) * 0.7:
                return actual_row

    return y_end


def crop_opencv(
    image: np.ndarray,
    white_threshold: int = 240,
    white_pct_threshold: float = 0.5,
    min_block_height: int = 100,
    exclude_overlay_bars: bool = True,
) -> Optional[dict]:
    """
    Extrait l'image principale d'une capture d'écran de post social media.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Détecter le mode: si la majorité des lignes du haut sont sombres -> dark mode
    top_mean = np.mean(gray[:50, :])
    is_dark_mode = top_mean < 100

    if is_dark_mode:
        dark_pct_per_row = np.mean(gray < 60, axis=1)
        is_image_row = dark_pct_per_row < 0.5
    else:
        white_pct_per_row = np.mean(gray > white_threshold, axis=1)
        is_image_row = white_pct_per_row < white_pct_threshold

    blocks = _find_contiguous_blocks(is_image_row)
    if not blocks:
        return None

    best_block = max(blocks, key=lambda b: b[1] - b[0])
    y_start, y_end = best_block

    if (y_end - y_start) < min_block_height:
        return None

    if exclude_overlay_bars:
        y_end = _trim_overlay_bars(image, gray, y_start, y_end)

    cropped = image[y_start:y_end, :]

    # Calculer la confiance basée sur le ratio de crop
    crop_h = cropped.shape[0]
    ratio = crop_h / h
    confidence = 0.95 if 0.2 < ratio < 0.8 and crop_h > 200 else 0.6

    return {
        "image": cropped,
        "coordinates": {
            "y_start": int(y_start),
            "y_end": int(y_end),
            "x_start": 0,
            "x_end": int(w),
        },
        "confidence": confidence,
    }


# ============================================================
# API ENDPOINTS
# ============================================================


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "image-cropper"}


@app.post("/crop/opencv", response_model=CropResult)
async def crop_with_opencv_endpoint(file: UploadFile = File(...)):
    """
    Crop une image en utilisant OpenCV.
    Gratuit et rapide (~5ms)
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        result = crop_opencv(img)

        if result is None:
            raise HTTPException(
                status_code=400, detail="Could not find suitable crop area"
            )

        _, buffer = cv2.imencode(".jpg", result["image"])
        img_b64 = base64.b64encode(buffer).decode("utf-8")

        h, w = result["image"].shape[:2]

        return CropResult(
            success=True,
            image_base64=img_b64,
            width=w,
            height=h,
            method="opencv",
            crop_coordinates=result["coordinates"],
            confidence=result["confidence"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8011"))
    uvicorn.run(app, host=host, port=port)
