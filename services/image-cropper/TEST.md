# Guide de Test - Image Cropper

## Services lancés

✅ Service Python FastAPI sur http://localhost:8011
✅ Documentation Swagger sur http://localhost:8011/docs

## Tests disponibles

### 1. Test du service Python directement (OpenCV)

```bash
# Avec curl
curl -X POST http://localhost:8011/crop/opencv \
  -F "file=@votre-screenshot.jpg" \
  | jq -r '.image_base64' | base64 -d > cropped-opencv.jpg

# Vérifier le résultat
open cropped-opencv.jpg  # macOS
```

### 2. Test du service Python (YOLOv8-Nano) - NOUVEAU! 🔥

```bash
# Avec curl
curl -X POST http://localhost:8011/crop/yolo \
  -F "file=@votre-screenshot.jpg" \
  | jq -r '.image_base64' | base64 -d > cropped-yolo.jpg

# Avec marge personnalisée (default: 10px)
curl -X POST "http://localhost:8011/crop/yolo?margin=20" \
  -F "file=@votre-screenshot.jpg" \
  | jq -r '.image_base64' | base64 -d > cropped-yolo.jpg

# Vérifier le résultat
open cropped-yolo.jpg  # macOS
```

### 3. Test du service Python (Gemini) - Nécessite GEMINI_API_KEY

```bash
# D'abord encoder votre image en base64
base64 -i votre-screenshot.jpg > image.b64

# Appeler l'API
curl -X POST http://localhost:8011/crop/gemini \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "'$(cat image.b64)'",
    "api_key": "VOTRE_GEMINI_API_KEY"
  }' | jq -r '.image_base64' | base64 -d > cropped-gemini.jpg
```

Ou avec upload direct:

```bash
curl -X POST http://localhost:8011/crop/gemini-upload \
  -F "file=@votre-screenshot.jpg" \
  -F "api_key=VOTRE_GEMINI_API_KEY" \
  | jq -r '.image_base64' | base64 -d > cropped-gemini.jpg
```

### 4. Test des endpoints NestJS

**IMPORTANT**: Pour tester les endpoints NestJS, il faut d'abord:

1. S'assurer que le service Python tourne (déjà fait ✅)
2. Lancer le whatsapp-agent en mode dev

```bash
# Dans un autre terminal
cd apps/whatsapp-agent
pnpm start:dev
```

Ensuite tester:

**Endpoint 1 - Gemini direct depuis NestJS:**

```bash
# Nécessite GEMINI_API_KEY dans .env
curl -X POST http://localhost:3001/test/crop/gemini \
  -F "image=@votre-screenshot.jpg"

# Résultat: image sauvegardée dans cropped-images/gemini-crop-*.jpg
```

**Endpoint 2 - YOLOv8-Nano via service Python:**

```bash
curl -X POST http://localhost:3001/test/crop/yolo \
  -F "image=@votre-screenshot.jpg"

# Résultat: image sauvegardée dans cropped-images/yolo-crop-*.jpg
```

**Endpoint 3 - OpenCV via service Python:**

```bash
curl -X POST http://localhost:3001/test/crop/opencv \
  -F "image=@votre-screenshot.jpg"

# Résultat: image sauvegardée dans cropped-images/opencv-crop-*.jpg
```

## Comparaison des résultats

Après avoir testé les trois stratégies, comparez:

| Méthode         | Coût    | Vitesse     | Précision             | Use Case                                     |
| --------------- | ------- | ----------- | --------------------- | -------------------------------------------- |
| **OpenCV**      | Gratuit | ~5ms ⚡⚡⚡ | Bonne pour UI simples | Screenshots classiques avec UI claire        |
| **YOLOv8-Nano** | Gratuit | ~50ms ⚡⚡  | Excellente 🎯         | Détection d'objets/produits dans toute image |
| **Gemini**      | $0.001  | ~1-2s ⚡    | Très bonne            | Cas complexes, fallback                      |

**Recommandation**:

1. Tester d'abord **YOLOv8-Nano** (gratuit + précis)
2. Utiliser **OpenCV** si vitesse critique et screenshots simples
3. **Gemini** comme fallback si les deux autres échouent

## Commandes utiles

```bash
# Voir les logs du service Python
docker compose -f docker-compose-agent-thirdparty.yml logs -f image-cropper

# Arrêter le service
docker compose -f docker-compose-agent-thirdparty.yml down image-cropper

# Rebuild si vous modifiez le code
docker compose -f docker-compose-agent-thirdparty.yml build image-cropper
docker compose -f docker-compose-agent-thirdparty.yml up -d image-cropper
```

## Exemples de screenshots à tester

Le système fonctionne bien avec:

- ✅ Posts Facebook (light/dark mode)
- ✅ Stories Instagram
- ✅ Posts TikTok
- ✅ Messages WhatsApp avec images

Testez avec différents types de screenshots pour voir quelle stratégie fonctionne le mieux!
