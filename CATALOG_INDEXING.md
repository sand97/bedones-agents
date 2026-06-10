# Indexation du catalogue (Qdrant)

Comment les produits d'un catalogue deviennent **cherchables par l'agent** (recherche sémantique
`search_products`), comment l'indexation est déclenchée aujourd'hui, et la **stratégie webhook**
(temps réel) prévue pour la suite.

## Vue d'ensemble

- **Stockage vectoriel** : Qdrant. Une **collection par catalogue**, nommée `catalog-{catalogId}`.
- **Vecteurs nommés** par point produit : `image` et `text` (distance `Cosine`), de dimension
  `GEMINI_EMBEDDING_DIMENSIONS` (768 par défaut).
- **Embeddings** : `GeminiEmbeddingService` (`embedText`, `embedImage`) + description d'image via
  `GeminiVisionService`. Fichiers : `apps/backend/src/image-processing/`.
- **Service** : `ProductImageIndexingService` (`product-image-indexing.service.ts`).
  - `syncCatalog(catalogId, organisationId)` : (1) `ensureCollection`, (2) **fetch des produits depuis
    l'API Meta** (`/{providerId}/products`), (3) diff avec Qdrant (par `productId` + empreinte image
    `imageId`), (4) index des nouveaux/modifiés, suppression des orphelins.
  - `indexProduct(catalogId, product)` : index **un seul** produit (`ensureCollection` +
    `indexSingleProduct`). Idempotent (même point id que `syncCatalog`).
- **Queue** : BullMQ `catalog-indexing` (`apps/backend/src/queue/queue.module.ts`), consommée par
  `CatalogIndexingProcessor` (`catalog-indexing.processor.ts`, `concurrency: 5`).

## Déclencheurs d'indexation

| Déclencheur | Où | Job |
|---|---|---|
| **Setup de l'agent** | `AgentService.analyzeCatalogs()` (`agent.service.ts`) | `index-catalog` |
| **Recovery au démarrage** | `ImageProcessingModule.onApplicationBootstrap()` — ré-enfile les catalogues `analysisStatus != COMPLETED` | `index-catalog` |
| **À la création d'un produit** *(nouveau)* | `CatalogService.createProduct()` (`catalog.service.ts`) | `index-product` |

> Il n'y a **pas de cron** périodique. `Product.needsIndexing` (schéma Prisma) n'est **pas utilisé** :
> l'état est porté par `Catalog.analysisStatus` et les empreintes Qdrant.

### Indexation à la création (implémentée)

Quand un produit est créé via **notre propre service** — UI (`POST /catalog/:id/products`) ou
import/migration (`catalog-migration.service.ts`) — tout passe par `CatalogService.createProduct()`,
qui poste vers Meta puis, en **best-effort**, enfile un job `index-product` :

```
[UI / migration] → CatalogService.createProduct() → POST Meta /{providerId}/products
                 → queue.add('index-product', { catalogId, product })
                 → CatalogIndexingProcessor → ProductImageIndexingService.indexProduct()
                 → Gemini embeddings → QdrantService.upsertProduct(catalog-{catalogId})
```

- Non bloquant : un échec d'enfilement ne fait jamais échouer la création.
- Le produit indexé utilise le **même point id** que `syncCatalog` → pas de doublon, ré-index sûr.
- Note : le **MCP debug** (`add_products`) écrit directement en DB locale et ne passe pas par
  `createProduct` ; il s'indexe via son propre outil `index_products`.

## Pourquoi pas un pull incrémental depuis Meta ?

L'API Commerce/Catalog de Meta **n'expose aucune date de modification** au niveau du produit : le nœud
`ProductItem` n'a ni `updated_time` ni `created_time`, et l'edge `/{catalog_id}/products` ne permet ni
tri ni filtre par date. Impossible donc de demander « les produits modifiés depuis X » ou « le plus
récemment modifié ». La seule façon de détecter des changements côté Meta est :
- soit un **full-fetch + diff** (ce que fait `syncCatalog`),
- soit un **push** via les webhooks catalogue (ci-dessous).

## Stratégie webhook temps réel (prévue — non implémentée)

Meta peut **pousser** une notification quand un catalogue change → plus besoin de cron.
Réf. : [Webhooks for Catalogs](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-catalogs/)
· [Webhooks Reference: Catalog](https://developers.facebook.com/docs/graph-api/webhooks/reference/catalog/)

### Objet & champs

- Objet Webhooks : **`Catalog`**. Champs à souscrire :
  - **`items_batch`** — notifie quand une session *Items Batch* a été persistée.
    `value = { catalog_id, handle, status }` (`status` = `Finished`, …). Le `handle` permet
    d'interroger `/check_batch_request_status` pour le détail des items du batch.
  - **`product_feed`** — notifie quand un *feed produit* a été persisté.
    `value = { catalog_id, product_feed_id, status }`.
- Enveloppe standard :
  ```json
  {
    "object": "catalog",
    "entry": [
      { "id": "<CATALOG_ID>", "time": 0,
        "changes": [ { "field": "items_batch", "value": { "catalog_id": "…", "handle": "…", "status": "Finished" } } ] }
    ]
  }
  ```

### Abonnement

1. **Dashboard de l'app** : configurer le webhook, objet **Catalog**, champs `items_batch` +
   `product_feed`, callback `/webhook/catalog`, verify token `CATALOG_WEBHOOK_VERIFY_TOKEN`.
2. **Abonner l'app au catalogue** : `POST {META_API_BASE}/{CATALOG_ID}/subscribed_apps?access_token=…`
   (permission `catalog_management` + droit d'édition sur le catalogue). À calquer sur
   `SocialService.subscribeWabaToWebhook()` ; à déclencher quand un catalogue est lié/analysé
   (`CatalogService.linkSocialAccounts()` ou `AgentService.analyzeCatalogs()`).

### Implémentation prévue

- **Récepteur déjà présent** : `catalog-webhook.controller.ts` (`/webhook/catalog`, vérif signature
  HMAC-SHA256 via `FACEBOOK_APP_SECRET`). Aujourd'hui il n'écoute que `field === 'product_catalog'`
  et se contente d'émettre l'event WS `catalog:updated` (via `CatalogService.handleWebhookUpdate`).
- **À faire** : brancher le dispatch sur `items_batch` / `product_feed` ; quand `value.status ===
  'Finished'`, résoudre le catalogue par `providerId` puis **enfiler `index-catalog`**
  (`{ catalogId, organisationId }`, `jobId: index-catalog-{catalogId}`) au lieu du simple event.
- **Débit** : le worker est déjà borné à `concurrency: 5` → au plus 5 catalogues synchronisés en
  parallèle, sans surcharger le serveur.
- **Option** : pour `items_batch`, exploiter `handle` + `/check_batch_request_status` pour ne
  réindexer que les `retailer_id` du batch (réindex ciblé) plutôt qu'un `syncCatalog` complet.

### Limite connue

Les champs `items_batch` / `product_feed` ciblent les écritures par **feed** ou **batch**. Une édition
**manuelle** d'un seul article dans Commerce Manager peut ne pas émettre de notification. Acceptable
tant que les mises à jour passent par feed/batch (ou via notre `createProduct`, déjà couvert par
l'indexation à la création).

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DISABLE_CATALOG_INDEXING` | `true` désactive toute l'indexation (kill switch) |
| `QDRANT_URL`, `QDRANT_API_KEY` | Connexion Qdrant (si `QDRANT_URL` absent → indexation no-op) |
| `GEMINI_API_KEY` | Embeddings/vision Gemini (absent → indexation ignorée) |
| `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS` | Modèle (déf. `gemini-embedding-2-preview`) et dimension (déf. 768) |
| `REDIS_URL` | Backend BullMQ |
| `CATALOG_WEBHOOK_VERIFY_TOKEN`, `CATALOG_WEBHOOK_REQUIRE_SIGNATURE`, `FACEBOOK_APP_SECRET` | Webhook catalogue (vérif + signature) |
