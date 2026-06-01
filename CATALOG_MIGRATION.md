# Catalogue WhatsApp → Commerce Manager (migration)

Importer le catalogue **public** d'un numéro WhatsApp (catalogue WhatsApp Business / SMB,
non accessible via l'API standard) dans un catalogue **Commerce Manager** connecté.

> Tout vit dans **bedones-agents**, y compris le service wppconnect (`apps/whatsapp-connector`).
> Le projet séparé `bedones-whatsapp` n'a servi que de **référence** pour le scraping de catalogue.

## Architecture (pattern callback)

```
Frontend (modale wizard)
  └─ POST /catalog-migration ───────────────► backend bedones-agents (apps/backend)
                                                 │
                                                 ├─ Bull queue `catalog-migration` (concurrence 1)
                                                 │     position + ETA (~1 min/sync) ──► websocket ──► browser
                                                 │
                                                 ├─ EXTRACTING:
                                                 │   POST {CONNECTOR}/whatsapp/execute-script (script + token)
                                                 │     └─ apps/whatsapp-connector (whatsapp-web.js, un de nos numéros)
                                                 │        lit le catalogue du wid CLIENT (`<phone>@c.us`) et, par image :
                                                 │          window.nodeFetch → POST /catalog-migration/callback/upload-image
                                                 │            └─ backend → Minio → renvoie l'URL
                                                 │        puis window.nodeFetch → POST /catalog-migration/callback/save-catalog
                                                 │            └─ backend écrit le JSON du catalogue sur Minio
                                                 │
                                                 └─ IMPORTING:
                                                       lit le JSON Minio → CatalogService.createProduct() ──► Meta
                                                       progression ──► websocket ──► browser
```

Callbacks authentifiés par un **JWT par-migration** (`scope: catalog-migration-callback`, 30 min),
vérifié par `CatalogMigrationCallbackGuard`. Aucun produit en base : seul un **JSON temporaire sur
Minio** persiste le temps de la sync. À la fin d'un job, `@OnWorkerEvent('completed')` rediffuse la
file (`catalog:migration-queue`) → l'ETA des autres décrémente.

## Le connecteur wppconnect — `apps/whatsapp-connector`

Service NestJS minimal (inspiré du connecteur de bedones-whatsapp) : whatsapp-web.js + Puppeteer.
- Auth par **QR** (un de nos numéros), rendu **directement dans le terminal** (`qrcode-terminal`).
- Endpoint générique `POST /whatsapp/execute-script` : injecte WPP (`@wppconnect/wa-js`) + expose
  `window.nodeFetch` (proxy axios côté Node, sans CSP) puis exécute le script et **retourne** sa valeur.
- Démarre **automatiquement au boot** (pas de `/start`). Autres routes : `POST /whatsapp/restart`, `GET /whatsapp/qr`, `GET /whatsapp/status`.
- Garde optionnelle `TargetInstanceGuard` (`CONNECTOR_INSTANCE_ID` ↔ header `x-bedones-target-instance`).

Le script d'extraction (dans `apps/backend/.../catalog-connector.client.ts`) cible le **wid du client**,
récupère prix (`priceAmount1000/1000`) + devise, et POST images/catalogue via les callbacks.

### Lancer le connecteur
```bash
cp apps/whatsapp-connector/.env.example apps/whatsapp-connector/.env
pnpm install
pnpm dev:whatsapp-connector            # port 3001 — démarre le client directement
# le QR s'affiche dans le terminal → scanner avec un de nos numéros
#   GET http://localhost:3001/whatsapp/status  → isReady: true
#   Swagger UI : http://localhost:3001/api
```
(ou en Docker : `apps/whatsapp-connector/Dockerfile`, contexte = racine du repo.)

## Parcours UI (modale `commerce-manager-migration-modal.tsx`)

Deux points d'entrée : **page Catalogues** (toolbar + état vide) et **carousel du Dashboard**.
1. **Intro** — Commerce Manager vs WhatsApp Business + question (Oui / Non / Je ne comprends pas).
2. **Création** (si Non / Je ne comprends pas) — explication + lien Commerce Manager.
3. **Connexion** — connecter/sélectionner le catalogue (OAuth) ; **localStorage** rouvre la modale à l'étape suivante.
4. **Numéro** — choisir un numéro WhatsApp (ou en ajouter un via l'embedded signup).
5. **Migration** — file d'attente → extraction → import (**antd `Steps`**), ETA + progression en temps réel.

## Variables d'environnement (apps/backend)

```
WHATSAPP_CATALOG_CONNECTOR_URL=http://localhost:3001   # apps/whatsapp-connector
WHATSAPP_CONNECTOR_INSTANCE_ID=                        # = CONNECTOR_INSTANCE_ID du connecteur (si activé)
WHATSAPP_MIGRATION_CALLBACK_URL=http://localhost:3005  # CE backend, joignable DEPUIS le connecteur
```
> Connecteur en Docker + backend sur l'hôte → `WHATSAPP_MIGRATION_CALLBACK_URL=http://host.docker.internal:3005`.

## Mise en route (récap)
1. Lancer `apps/whatsapp-connector` (le client démarre tout seul) et scanner le QR (terminal) avec un de nos numéros.
2. `pnpm --filter backend exec prisma migrate deploy` (migration `20260529000000_add_catalog_migration`) + `prisma generate`. Redis requis.
3. Renseigner les 3 variables ci-dessus. Lancer backend + frontend.

## Notes
- **Prix** : `priceAmount1000/1000` (unités majeures) → `createProduct` (×100 pour Meta), comme la création manuelle.
- Images : téléchargées dans la session WhatsApp, réhébergées sur Minio via `upload-image`, fournies à Meta en `image_url`.
- Le catalogue de destination doit être **connecté à Commerce Manager** (`providerId`) avant l'import.
- ETA = nombre de migrations en attente devant soi × ~1 min (une extraction à la fois).
