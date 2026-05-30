# Bedones Agents

## Règles Sécurité

- **Toujours masquer les données sensibles par défaut** via le `omit` global de Prisma dans `PrismaService`. Les champs comme `passwordHash`, `accessToken`, `refreshToken` ne doivent **jamais** être retournés par défaut dans les requêtes Prisma. Si un service interne a besoin d'un champ masqué, utiliser `omit: { fieldName: false }` ou un `select` explicite dans la requête concernée.

## Règles Design System

- **Ne jamais utiliser de composants HTML bruts** (`<button>`, `<textarea>`, `<select>`, `<input>`) dans les pages ou composants. Utiliser systématiquement les composants Ant Design (`Button`, `Input`, `Input.TextArea`, `Select`, `Dropdown`, etc.).

### Où écrire le CSS : Tailwind dans le composant **vs** `styles.css`

Règle de décision unique : **« Est-ce que je style un composant *système* (Antd) ou quelque chose de *global* à toute l'application ? → `apps/frontend/src/styles.css`. Est-ce que je style un composant que j'ai créé moi-même ? → Tailwind directement dans le composant. »**

- **Tailwind directement dans le composant (cas par défaut).** Dès qu'on crée soi-même un composant (carte, panneau, ligne de liste, section de page, layout maison, header, etc.), **tout** son style s'écrit en classes Tailwind dans le `className` du JSX : positionnement (flex, grid, gap, padding), typographie (`text-sm`, `font-semibold`) **et** style visuel (background, border, radius, ombre, hover, couleurs). On utilise les tokens du thème (`bg-bg-surface`, `text-text-primary`, `border-border-default`, `rounded-card`, `shadow-card`…) et, à défaut de token, des valeurs arbitraires (`text-[14.5px]`, `bg-[#9a958d]`, `max-md:hidden`, `before:content-['']`, `[grid-template-areas:…]`…). **Ne jamais** créer de classe CSS custom dans `styles.css` pour styler un composant maison.

- **`styles.css` — réservé au global et aux composants système.** On n'y écrit que :
  1. **Les tokens de thème Tailwind** — le bloc `@theme { … }` (couleurs, radius, ombres, espacements partagés par toute l'app).
  2. **Les overrides de composants système Antd** (`Button`, `Tabs`, `Select`, `DatePicker`, `Pagination`, `Collapse`, `Modal`…). Ils doivent **cibler les classes internes d'Antd** (`.ant-…`) — impossible à exprimer via un `className` Tailwind — donc ils vivent ici.
  3. **Le style global / reset** de l'application (`body`, `html`, `*`, focus) et tout réglage commun à toute l'app.
  4. **Les animations globales** (`@keyframes`) et les systèmes d'animation réutilisés (ex. scroll-reveal).

- **Organisation : `styles.css` n'est qu'un point d'entrée.** Le fichier `apps/frontend/src/styles.css` ne contient plus que `@import 'tailwindcss'` puis les `@import './styles/*.css'`. Le CSS autorisé (cf. ci-dessus) est découpé **par concern / feature** dans le dossier `apps/frontend/src/styles/` : `theme.css` (le bloc `@theme`), `base.css` (reset global), `antd.css` (overrides `.ant-…`), `animations.css` (`@keyframes` + scroll-reveal), et un fichier par domaine pour le CSS système restant (`layout.css`, `comments.css`, `chat.css`, `tickets.css`, `catalog.css`, `pages.css`, `marketing.css`, `auth.css`). Quand tu ajoutes du CSS autorisé, écris-le dans le partial correspondant (et ajoute son `@import` dans `styles.css` si tu crées un nouveau partial) — **ne recrée jamais un gros fichier monolithique**.

- **En résumé.** Tu modifies l'apparence d'un composant Antd ou un réglage global → `styles.css`. Tu construis/styles ton propre composant → Tailwind dans le composant. Ne **jamais** accumuler du CSS de composants maison dans `styles.css` — c'est exactement ce qui l'a fait gonfler.

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
