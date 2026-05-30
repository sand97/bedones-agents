# Catalogue WhatsApp → Commerce Manager (migration)

Importer le catalogue **public** d'un numéro WhatsApp (catalogue WhatsApp Business / SMB,
non accessible via l'API standard) dans un catalogue **Commerce Manager** connecté.

> Tout le code vit dans **bedones-agents**. `bedones-whatsapp` n'est **pas modifié** : on
> réutilise tel quel son `whatsapp-connector` (endpoint générique `/whatsapp/execute-script`
> + `window.nodeFetch`) et le script `apps/backend/src/page-scripts/scripts/getCatalog.ts`
> sert de référence.

## Architecture (pattern callback)

```
Frontend (modale wizard)
  └─ POST /catalog-migration ───────────────► bedones-agents (NestJS)
                                                 │
                                                 ├─ Bull queue `catalog-migration` (concurrence 1)
                                                 │     position + ETA (~1 min/sync) ──► websocket ──► browser
                                                 │
                                                 ├─ EXTRACTING:
                                                 │   POST {CONNECTOR}/whatsapp/execute-script (script + token)
                                                 │     └─ le script (session WhatsApp) lit le catalogue du
                                                 │        wid CLIENT (`<phone>@c.us`), et pour chaque image :
                                                 │          nodeFetch → POST /catalog-migration/callback/upload-image
                                                 │            └─ bedones-agents → Minio → renvoie l'URL
                                                 │        puis nodeFetch → POST /catalog-migration/callback/save-catalog
                                                 │            └─ bedones-agents écrit le JSON du catalogue sur Minio
                                                 │
                                                 └─ IMPORTING:
                                                       lit le JSON Minio → CatalogService.createProduct() ──► Meta
                                                       progression ──► websocket ──► browser
```

Callbacks authentifiés par un **JWT par-migration** (`scope: catalog-migration-callback`,
30 min), vérifié par `CatalogMigrationCallbackGuard`. Aucun produit n'est stocké en base :
seul un **JSON temporaire sur Minio** persiste le temps de la synchronisation.

Un job se termine → `@OnWorkerEvent('completed')` → on rediffuse la file aux utilisateurs en
attente (`catalog:migration-queue`), leur ETA décrémente.

## Le script injecté

`catalog-connector.client.ts` contient un script (adapté de `getCatalog.ts`) injecté via
`/whatsapp/execute-script`. Différences avec l'original :
- cible le **wid du client** (`{{CLIENT_USER_ID}}`) au lieu de `WPP.conn.getMyUserId()` ;
- prix = `priceAmount1000 / 1000` (unités majeures), devise = `product.currency` ;
- POST les images vers `upload-image` et le catalogue vers `save-catalog`
  (`window.nodeFetch`, proxy server-side du connecteur → pas de CSP/CORS), avec
  `Authorization: Bearer {{TOKEN}}`.

## Parcours UI (modale `commerce-manager-migration-modal.tsx`)

Deux points d'entrée : **page Catalogues** (toolbar + état vide) et **carousel du Dashboard**.

1. **Intro** — Commerce Manager vs WhatsApp Business + question « Avez-vous déjà un catalogue ? »
   (Oui / Non / Je ne comprends pas).
2. **Création** (si Non / Je ne comprends pas) — explication + lien Commerce Manager.
3. **Connexion** — connecter/sélectionner le catalogue (OAuth). Le **localStorage**
   (`catalog-migration-draft`) rouvre la modale à l'étape suivante au retour.
4. **Numéro** — choisir un numéro WhatsApp (ou en ajouter un via l'embedded signup).
5. **Migration** — file d'attente → extraction → import (**antd `Steps`**), ETA + progression
   temps réel via websocket.

## Variables d'environnement (bedones-agents backend)

```
WHATSAPP_CATALOG_CONNECTOR_URL=http://localhost:3001   # base URL du connecteur wppconnect
WHATSAPP_CONNECTOR_INSTANCE_ID=                        # = CONNECTOR_INSTANCE_ID du connecteur (si activé)
WHATSAPP_MIGRATION_CALLBACK_URL=http://localhost:3005  # URL de CE backend, joignable depuis le connecteur
```

Le réhébergement d'images et le JSON temporaire utilisent la config **Minio** existante.

## Mise en route

1. **Connecteur** : démarrer `whatsapp-connector`, scanner le QR (terminal) avec **un de nos numéros**.
2. **Backend** : `pnpm --filter backend exec prisma migrate deploy` (migration
   `20260529000000_add_catalog_migration`) puis `prisma generate`. Redis requis.
3. Renseigner `WHATSAPP_CATALOG_CONNECTOR_URL` + `WHATSAPP_MIGRATION_CALLBACK_URL` (le connecteur
   doit joindre cette URL, et l'URL Minio publique, pour les callbacks et les images).
4. Lancer backend + frontend.

## Vérification de bout en bout

1. Dashboard → carousel « catalogue » (ou page Catalogues) → la modale s'ouvre.
2. Intro → connexion (OAuth, retour dans la modale) → choix du numéro.
3. « Lancer l'importation » → file d'attente avec ETA, puis extraction et import en direct.
4. À la fin, « Voir le catalogue » → les produits importés (avec prix/devise) apparaissent.

## Notes
- **Prix** : `priceAmount1000/1000` (unités majeures) passé en string à `createProduct`, qui le
  convertit vers les unités mineures de Meta (×100), comme pour la création manuelle de produits.
- Images : téléchargées dans le navigateur (session WhatsApp), réhébergées sur Minio via
  `upload-image`, puis fournies à Meta en `image_url`.
- Le catalogue de destination doit être **connecté à Commerce Manager** (`providerId`) avant l'import.
- ETA = nombre de migrations en attente devant soi × ~1 min (une extraction à la fois).
