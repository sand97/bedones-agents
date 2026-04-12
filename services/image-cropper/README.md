# Image Cropper Service

Service FastAPI pour découper intelligemment des captures d'écran de posts social media (Facebook, Instagram, TikTok, etc.) afin d'extraire l'image produit principale.

## Deux stratégies disponibles

### 1. OpenCV Pure (Gratuit, Rapide ~5ms)

- Analyse de la structure des bandes UI (blanches/grises) en haut et en bas
- Détection automatique du mode clair/sombre
- 0 coût
- Très rapide (~5ms par image)
- Fonctionne bien pour les screenshots classiques

### 2. Gemini Vision API (Robuste, ~$0.001/appel)

- Utilise l'IA pour détecter le bounding box de l'image produit
- Plus robuste pour les cas complexes
- Coût minimal (~$0.001 par appel)
- Requiert une clé API Gemini

## Installation

### Avec Docker (Recommandé)

```bash
# Depuis la racine du projet
docker-compose -f docker-compose-agent-thirdparty.yml up image-cropper
```

### En local

```bash
cd apps/whatsapp-agent/services/image-cropper

# Installer les dépendances
pip install -r requirements.txt

# Lancer le service
python app.py
```

Le service sera disponible sur `http://localhost:8011`

## Endpoints

### Health Check

```bash
GET /health
```

### OpenCV Cropping

```bash
POST /crop/opencv
Content-Type: multipart/form-data

{
  "file": <image-file>
}
```

**Réponse:**

```json
{
  "success": true,
  "image_base64": "base64-encoded-image",
  "width": 1080,
  "height": 1350,
  "method": "opencv",
  "crop_coordinates": {
    "y_start": 120,
    "y_end": 800,
    "x_start": 0,
    "x_end": 1080
  },
  "confidence": 0.95
}
```

### Gemini Cropping (avec base64)

```bash
POST /crop/gemini
Content-Type: application/json

{
  "image_base64": "base64-string",
  "api_key": "optional-gemini-api-key"
}
```

### Gemini Cropping (avec upload)

```bash
POST /crop/gemini-upload
Content-Type: multipart/form-data

{
  "file": <image-file>,
  "api_key": "optional-gemini-api-key"
}
```

## Variables d'environnement

- `HOST`: Adresse d'écoute (défaut: `0.0.0.0`)
- `PORT`: Port d'écoute (défaut: `8011`)
- `GEMINI_API_KEY`: Clé API Gemini (optionnel, peut être passé dans la requête)

## Intégration NestJS

Deux endpoints sont disponibles dans le whatsapp-agent NestJS:

1. **POST /test/crop/gemini** - Utilise Gemini directement depuis NestJS
2. **POST /test/crop/opencv** - Appelle ce service Python pour utiliser OpenCV

Les deux endpoints sauvegardent l'image croppée dans `cropped-images/` et retournent le chemin.

## Tests

```bash
# Test avec curl
curl -X POST http://localhost:8011/crop/opencv \
  -F "file=@screenshot.jpg" \
  -o response.json

# Décoder l'image base64 de la réponse
cat response.json | jq -r '.image_base64' | base64 -d > cropped.jpg
```

## Documentation interactive

Une fois le service lancé, accéder à la documentation Swagger:

- http://localhost:8011/docs
