# Catalogue WhatsApp → Commerce Manager (migration)

Importer le catalogue **public** d'un numéro WhatsApp (catalogue WhatsApp Business / SMB,
non accessible via l'API standard) dans un catalogue **Commerce Manager** connecté.

## Architecture

```
Frontend (modale wizard)
  └─ POST /catalog-migration ───────────────► bedones-agents (NestJS)
                                                 │
                                                 ├─ Bull queue `catalog-migration` (concurrence 1)
                                                 │     position + ETA (~1 min/sync) ──► websocket ──► browser
                                                 │
                                                 ├─ EXTRACTING:
                                                 │     GET {CONNECTOR}/catalog/public/:phone
                                                 │       └─ whatsapp-connector (wppconnect, notre numéro)
                                                 │            lit le catalogue public du numéro cible,
                                                 │            réhéberge les images sur Minio (URLs présignées)
                                                 │
                                                 └─ IMPORTING:
                                                       CatalogService.createProduct() ──► Meta Graph API
                                                       progression ──► websocket ──► browser
```

Un job se termine → `@OnWorkerEvent('completed')` → on rediffuse la file à tous les
utilisateurs en attente (`catalog:migration-queue`), leur ETA décrémente.

## Parcours UI (modale `commerce-manager-migration-modal.tsx`)

Deux points d'entrée : **page Catalogues** (toolbar + état vide) et **carousel du Dashboard**.

1. **Intro** — explique Commerce Manager vs WhatsApp Business, propose la migration, demande
   « Avez-vous déjà un catalogue Commerce Manager ? » (Oui / Non / Je ne comprends pas).
2. **Création** (si Non / Je ne comprends pas) — explication + lien Commerce Manager.
3. **Connexion** — connecter/sélectionner le catalogue (OAuth Facebook). Le **localStorage**
   (`catalog-migration-draft`) rouvre la modale à l'étape suivante au retour.
4. **Numéro** — choisir un numéro WhatsApp à importer (ou en ajouter un via l'embedded signup).
5. **Migration** — file d'attente → extraction → import (composant **antd `Steps`**), ETA et
   progression en temps réel via websocket.

## Fichiers

**bedones-agents**
- `apps/backend/prisma/schema.prisma` — modèle `CatalogMigration` + enum `CatalogMigrationStatus`
  (+ migration `prisma/migrations/20260529000000_add_catalog_migration`)
- `apps/backend/src/catalog-migration/` — service, processor (concurrence 1), controller,
  `catalog-connector.client.ts`
- `apps/backend/src/queue/queue.module.ts` — queue `catalog-migration`
- `apps/frontend/src/app/components/catalog/commerce-manager-migration-modal.tsx`
- `apps/frontend/src/app/lib/catalog-migration-draft.ts`, `agent-api.ts` (méthodes migration)

**bedones-whatsapp**
- `apps/whatsapp-connector/src/catalog/catalog.controller.ts` — `GET /catalog/public/:phoneNumber`
- `apps/whatsapp-connector/src/catalog/catalog.service.ts` — `fetchPublicCatalogForNumber`,
  `buildPublicCatalogPayload`
- `apps/whatsapp-connector/src/whatsapp/whatsapp-client.service.ts` — `getReadyPage()`

## Variables d'environnement (bedones-agents backend)

```
WHATSAPP_CATALOG_CONNECTOR_URL=http://localhost:3001   # base URL du connecteur wppconnect
WHATSAPP_CONNECTOR_SECRET=...                          # = CONNECTOR_SECRET du connecteur (optionnel)
```

## Mise en route

1. **Connecteur** : démarrer `whatsapp-connector`, scanner le QR (terminal) avec **un de nos numéros**.
2. **Backend** : `pnpm --filter backend exec prisma migrate deploy` (ou `prisma db push`) puis
   `prisma generate`. Redis requis (`REDIS_URL`).
3. Renseigner `WHATSAPP_CATALOG_CONNECTOR_URL` (+ secret).
4. Lancer backend + frontend.

## Vérification de bout en bout

1. Dashboard → carousel « catalogue » (ou page Catalogues) → la modale s'ouvre.
2. Étapes intro → connexion (OAuth, retour dans la modale) → choix du numéro.
3. « Lancer l'importation » → file d'attente avec ETA, puis extraction et import en direct.
4. À la fin, « Voir le catalogue » → les produits importés apparaissent.

## Hypothèses / limites (à valider)

- **Prix** : non recopié pour l'instant (unité minor/major ambiguë entre WhatsApp et Meta) —
  nom, description, images et disponibilité le sont. À compléter une fois l'unité confirmée.
- Le connecteur réhéberge les images sur Minio en **URLs présignées (7 j)** car les URLs CDN
  WhatsApp sont éphémères/authentifiées et non lisibles par Meta.
- Le catalogue de destination doit être **connecté à Commerce Manager** (il a un `providerId`)
  avant l'import (l'étape « Connexion » s'en charge).
- ETA = nombre de migrations en attente devant soi × ~1 min (une extraction à la fois).
