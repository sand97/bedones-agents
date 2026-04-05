# Bedones Agents

## Règles Sécurité

- **Toujours masquer les données sensibles par défaut** via le `omit` global de Prisma dans `PrismaService`. Les champs comme `passwordHash`, `accessToken`, `refreshToken` ne doivent **jamais** être retournés par défaut dans les requêtes Prisma. Si un service interne a besoin d'un champ masqué, utiliser `omit: { fieldName: false }` ou un `select` explicite dans la requête concernée.

## Règles Design System

- **Ne jamais utiliser de composants HTML bruts** (`<button>`, `<textarea>`, `<select>`, `<input>`) dans les pages ou composants. Utiliser systématiquement les composants Ant Design (`Button`, `Input`, `Input.TextArea`, `Select`, `Dropdown`, etc.).
- Tailwind CSS est réservé au **positionnement** (flex, grid, gap, margin, padding) et à la **typographie** (text-sm, font-semibold). Le style visuel des composants (background, border, hover, colors) doit venir d'Antd et de son thème.
- Les seules exceptions acceptées sont les éléments interactifs complexes avec des classes CSS centralisées (ex: `sidebar__nav-item`, `chat-conv-item`, `ticket-card`).

## Règles API / React Query

- **Toujours utiliser `$api` (`openapi-react-query`)** pour les appels API côté frontend. Ne jamais utiliser `useQuery` / `useMutation` manuellement depuis `@tanstack/react-query`, ni `fetch` / `axios` directement.
- Le client `$api` est importé depuis `@app/lib/api/$api`. Les types sont auto-générés dans `@app/lib/api/v1.d.ts` à partir du Swagger backend.
- **Pattern query** : `$api.useQuery('get', '/path/{param}', { params: { path: { param } } }, { enabled })`
- **Pattern mutation** : `$api.useMutation('post', '/path')` puis `mutation.mutateAsync({ params, body })`
- **Mise à jour du cache plutôt qu'invalidation** : Si le résultat d'une mutation permet de déduire le nouvel état du cache (ex: marquer comme lu → `unreadCount: 0`, envoyer un message → ajouter au tableau), utiliser `queryClient.setQueryData()` pour mettre à jour le cache directement. Ne jamais faire d'`invalidateQueries` quand on connaît déjà l'état final — ça déclenche un appel réseau inutile. Réserver `invalidateQueries` aux cas où l'on ne peut pas prédire le nouvel état (ex: sync depuis une API externe).
- **Invalidation (si nécessaire)** : `queryClient.invalidateQueries({ queryKey: ['get', '/path/{param}', { params: { path: { param } } }] })`
- Pour régénérer les types après modification des endpoints backend : `npx openapi-typescript apps/backend/swagger-output/swagger.json -o apps/frontend/src/app/lib/api/v1.d.ts`
