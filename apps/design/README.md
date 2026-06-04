# Studio images catalogue (`design`)

Service plein écran de Bedones pour **habiller en lot les images du catalogue**
(cadres / overlays marketing : prix, promo, logo, texte) et les exporter aux
formats réseaux sociaux. Il s'ouvre depuis la vue Catalogue du frontend
(`design.bedones.com/?catalogId=…&org=…`).

## Stack

Même base que `apps/frontend` (Vite + React 19 + TypeScript). SPA (pas de SSR :
l'éditeur est piloté par `<canvas>`). La charte visuelle reprend le design system
Bedones (`src/styles/colors_and_type.css`) — monochrome, Geist.

## Flux (4 écrans)

1. **Galerie** — liste des templates, recherche, « Nouveau template ».
2. **Éditeur** — tool-rail (Texte, Rectangle, Cercle, Logo, Zone produit, Champ
   dynamique), canvas avec format **1:1 / 4:5 / 9:16 / 16:9**, propriétés live
   (contenu fixe ou champ dynamique lié au produit, typo, couleur, position),
   calques, glisser-déposer.
3. **Sélection des images** — produits groupés par collection, une ligne par
   produit, recherche, sélection multiple.
4. **Aperçu & export** — carrousel + miniatures + panneau latéral, puis
   **génération réelle d'un ZIP** : chaque image est composée sur `<canvas>` à la
   résolution native du format puis empaquetée en PNG nommés par code marchand.

## Authentification & données

- La session est partagée via le **cookie** de `api-moderator.bedones.com`
  (`credentials: 'include'`). L'utilisateur est déjà connecté.
- Avec un `catalogId` dans l'URL, le studio charge les **collections + produits
  réels** (et leurs images stockées) via l'API catalogue ; sinon il retombe sur
  un jeu de **données de démonstration** (badge « Démo » dans l'app bar).
- Les **templates** sont persistés par catalogue (localStorage v1). Point de
  bascule prêt pour des endpoints backend (`src/lib/api.ts`).

## Variables d'environnement

| Variable       | Défaut                              | Rôle                         |
| -------------- | ----------------------------------- | ---------------------------- |
| `VITE_API_URL` | `https://api-moderator.bedones.com` | Base de l'API (cookie share) |

## Développement

```bash
pnpm --filter design dev      # http://localhost:3008
# ou, derrière Caddy : https://design.bedones.local
```

## Build / Docker

```bash
pnpm --filter design build    # → dist/
docker build -t bedones-design apps/design   # sert le SPA via Caddy sur :3008
```

## À venir (backend)

- Optimisation des images produit à l'upload (sharp) + stockage MinIO à taille
  optimale, et persistance du lien côté BD.
- Détection de la résolution Meta faible → remplacement de l'image par une
  version HD (push Meta Commerce Manager + stockage HD).
- Persistance serveur des templates (remplace le localStorage).
