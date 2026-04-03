# Bedones Agents

## Règles Sécurité

- **Toujours masquer les données sensibles par défaut** via le `omit` global de Prisma dans `PrismaService`. Les champs comme `passwordHash`, `accessToken`, `refreshToken` ne doivent **jamais** être retournés par défaut dans les requêtes Prisma. Si un service interne a besoin d'un champ masqué, utiliser `omit: { fieldName: false }` ou un `select` explicite dans la requête concernée.

## Règles Design System

- **Ne jamais utiliser de composants HTML bruts** (`<button>`, `<textarea>`, `<select>`, `<input>`) dans les pages ou composants. Utiliser systématiquement les composants Ant Design (`Button`, `Input`, `Input.TextArea`, `Select`, `Dropdown`, etc.).
- Tailwind CSS est réservé au **positionnement** (flex, grid, gap, margin, padding) et à la **typographie** (text-sm, font-semibold). Le style visuel des composants (background, border, hover, colors) doit venir d'Antd et de son thème.
- Les seules exceptions acceptées sont les éléments interactifs complexes avec des classes CSS centralisées (ex: `sidebar__nav-item`, `chat-conv-item`, `ticket-card`).
