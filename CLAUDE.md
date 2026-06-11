# Bedones Agents

## Règles Architecture & Taille des fichiers

- **Maximum ~500 lignes par fichier** (hors fichiers générés comme `routeTree.gen.ts`, `v1.d.ts`, et hors fichiers de données comme `google-product-categories.ts`). Si un fichier dépasse, le découper AVANT d'y ajouter du code. Ne jamais faire grossir un fichier déjà au-dessus de la limite.

### Backend (NestJS)

- NestJS existe pour l'**injection de dépendances** : tout mettre dans un seul gros service la rend inutile. Un module = un domaine, découpé en plusieurs petits services `@Injectable()` par responsabilité (ex: `social/messaging/whatsapp-messaging.service.ts`, `loyalty/services/loyalty-campaign.service.ts`).
- Quand un service devient trop gros : extraire des **sous-services** dans un sous-dossier du module, enregistrés dans les `providers` du module. Le service d'origine peut rester en **façade** (mêmes méthodes publiques, qui délèguent) pour ne pas casser les appelants.
- **Jamais de dépendance circulaire** : un sous-service n'injecte jamais sa façade. Les helpers partagés entre sous-services vont dans un service/util partagé du même dossier.
- Les contrôleurs restent minces : validation/DTO + appel de service, aucune logique métier.

### Frontend (React + TanStack Router + Antd)

Le frontend est structuré en 4 couches — respecter cette hiérarchie pour tout nouveau code :

1. **Design system** : composants Ant Design customisés par le thème et le CSS centralisé (voir Règles Design System ci-dessous). Pas de style visuel ad hoc.
2. **Composants généraux réutilisables** : `app/components/shared/` (et `app/components/icons`, `layout`) — sans logique métier de domaine.
3. **Composants de section / par domaine** : `app/components/<domaine>/` (ex: `whatsapp/`, `catalog/`, `auth/`, `agent/`). Quand un composant grossit, le découper en sous-dossier du même nom (ex: `chat-window.tsx` + `chat-window/message-bubble.tsx`) en gardant le fichier d'origine comme point d'entrée pour ne pas casser les imports. La logique d'état/queries d'une page va dans un hook `use-<nom>.ts` du domaine.
4. **Pages / routes** : `routes/**` = routing par fichiers TanStack. **Ne jamais déplacer ni renommer un fichier de route**, ne jamais toucher `routeTree.gen.ts`. Une route ne contient que la définition (`createFileRoute`, `validateSearch`...) et l'assemblage de sections — pas de gros blocs de JSX ni de logique métier.

### Refactoring

- Tout découpage de fichier doit être **mécanique** (déplacement verbatim) : ne pas en profiter pour "corriger" de la logique, renommer des APIs publiques ou changer des textes.
- Vérifier après découpage : `npx tsc --noEmit -p tsconfig.json` dans l'app concernée, puis eslint/prettier sur les fichiers touchés.

## Règles Sécurité

- **Toujours masquer les données sensibles par défaut** via le `omit` global de Prisma dans `PrismaService`. Les champs comme `passwordHash`, `accessToken`, `refreshToken` ne doivent **jamais** être retournés par défaut dans les requêtes Prisma. Si un service interne a besoin d'un champ masqué, utiliser `omit: { fieldName: false }` ou un `select` explicite dans la requête concernée.

## Règles Design System

- **Ne jamais utiliser de composants HTML bruts** (`<button>`, `<textarea>`, `<select>`, `<input>`) dans les pages ou composants. Utiliser systématiquement les composants Ant Design (`Button`, `Input`, `Input.TextArea`, `Select`, `Dropdown`, etc.).
- Tailwind CSS est réservé au **positionnement** (flex, grid, gap, margin, padding) et à la **typographie** (text-sm, font-semibold). Le style visuel des composants (background, border, hover, colors) doit venir d'Antd et de son thème.
- Les seules exceptions acceptées sont les éléments interactifs complexes avec des classes CSS centralisées (ex: `sidebar__nav-item`, `chat-conv-item`, `ticket-card`).

## Fichiers protégés (ne pas modifier)

- **Ne jamais modifier ni remplacer les données mock** dans les composants suivants. Ces composants utilisent volontairement des mocks en attendant d'être branchés sur l'API réelle. Ne pas les "corriger" en les connectant à l'API, ne pas supprimer les imports de `mock-data`, ne pas remplacer `MOCK_*` par des appels API :
  - `apps/frontend/src/app/components/catalog/article-picker-modal.tsx`
  - `apps/frontend/src/app/components/tickets/create-ticket-modal.tsx`
  - `apps/frontend/src/app/components/whatsapp/mock-data.ts`

- **⚠️ Modales protégées — Ne pas modifier sauf ordre explicite.** Les modales suivantes ont été restaurées après suppression accidentelle par un agent. **Ne JAMAIS les modifier** sauf si l'utilisateur donne un ordre explicite et précis. En cas de modification autorisée, ne JAMAIS supprimer ou altérer les champs, props, form items ou imports existants. Uniquement ajouter, jamais supprimer ni remplacer :
  - `apps/frontend/src/app/components/promotions/create-promotion-modal.tsx` — Modal de création/édition de promotion
  - `apps/frontend/src/app/components/promotions/product-picker-modal.tsx` — Modal de sélection de produits pour une promotion
  - `apps/frontend/src/app/components/tickets/create-ticket-modal.tsx` — Modal de création de ticket avec articles, charges et promotions
- **Ne pas réécrire les pages qui intègrent ces modales** (`promotions.tsx`, `tickets.tsx`) en supprimant les imports ou le rendu des modales. Les boutons "Ajouter"/"Créer" doivent toujours ouvrir la modale correspondante.

## Règles API / React Query

- **Toujours utiliser `$api` (`openapi-react-query`)** pour les appels API côté frontend. Ne jamais utiliser `useQuery` / `useMutation` manuellement depuis `@tanstack/react-query`, ni `fetch` / `axios` directement.
- Le client `$api` est importé depuis `@app/lib/api/$api`. Les types sont auto-générés dans `@app/lib/api/v1.d.ts` à partir du Swagger backend.
- **Pattern query** : `$api.useQuery('get', '/path/{param}', { params: { path: { param } } }, { enabled })`
- **Pattern mutation** : `$api.useMutation('post', '/path')` puis `mutation.mutateAsync({ params, body })`
- **Mise à jour du cache plutôt qu'invalidation** : Si le résultat d'une mutation permet de déduire le nouvel état du cache (ex: marquer comme lu → `unreadCount: 0`, envoyer un message → ajouter au tableau), utiliser `queryClient.setQueryData()` pour mettre à jour le cache directement. Ne jamais faire d'`invalidateQueries` quand on connaît déjà l'état final — ça déclenche un appel réseau inutile. Réserver `invalidateQueries` aux cas où l'on ne peut pas prédire le nouvel état (ex: sync depuis une API externe).
- **Invalidation (si nécessaire)** : `queryClient.invalidateQueries({ queryKey: ['get', '/path/{param}', { params: { path: { param } } }] })`
- Pour régénérer les types après modification des endpoints backend : `npx openapi-typescript apps/backend/swagger-output/swagger.json -o apps/frontend/src/app/lib/api/v1.d.ts`
