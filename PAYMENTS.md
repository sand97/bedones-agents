# Système de Souscription & Paiement (backend)

Backend du système de paiement pour les forfaits (issues #101 / #102). Deux
parcours distincts, comme demandé :

- **Souscription récurrente (Stripe `mode: subscription`)** — un **vrai abonnement**
  qui se renouvelle automatiquement, pour passer en forfait **Pro** ou **Business**.
- **Achat ponctuel de crédits (Stripe `mode: payment`)** — un paiement **one-shot**,
  réservé à l'achat de crédits supplémentaires (par palier de **1000**), uniquement
  pour les organisations déjà sur un forfait payant.

> Inspiré de l'intégration Stripe de `tcf-canada-formation`, adapté à
> l'architecture NestJS + Prisma de ce backend, et étendu aux abonnements
> récurrents (TCF n'utilisait que des paiements ponctuels).

## Modèle de données (Prisma)

- `Organisation.plan` (`OrgPlan` : `FREE | PRO | BUSINESS`, défaut `FREE`) — cache
  dénormalisé du forfait actif, mis à jour par les webhooks. Source de vérité = la
  `Subscription`.
- `Organisation.purchasedCredits` (`Int`) — solde de crédits supplémentaires achetés,
  ajouté au quota mensuel de base.
- `Subscription` (1 par organisation) — forfait, statut (`SubscriptionStatus`),
  cadence (`billingMonths` 1/6/12), période courante, références Stripe
  (`stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`), `cancelAtPeriodEnd`.
- `Payment` — trace chaque paiement (`PaymentKind` = `SUBSCRIPTION | CREDIT_PURCHASE`,
  `PaymentStatus`, montant, devise, crédits achetés, références Stripe).

Migration : `prisma/migrations/20260613210000_add_subscription_and_payment`.

## Catalogue des forfaits

Défini dans `src/payment/plans.config.ts` (miroir des constantes frontend, **aucun
price ID Stripe codé en dur** — les prix sont créés dynamiquement via `price_data`) :

| Forfait  | Crédits/mois | Prix/mois | Overage (crédit sup.) |
|----------|-------------:|----------:|----------------------:|
| Free     |          200 |       $0  | —                     |
| Pro      |        1 000 |      $10  | $0.01                 |
| Business |        3 000 |      $25  | $0.008                |

Remise de durée : 6 mois → −20 %, 12 mois → −25 %. L'abonnement Stripe se
renouvelle tous les `billingMonths` mois, au total remisé de la période.

## Endpoints (`/payment`)

Authentifiés (cookie de session). Les mutations exigent le rôle **OWNER** ou **ADMIN**.

| Méthode | Route | Rôle |
|--------|-------|------|
| `GET`  | `/payment/org/:organisationId/subscription` | statut forfait + crédits |
| `GET`  | `/payment/org/:organisationId/payments` | historique des paiements |
| `POST` | `/payment/org/:organisationId/checkout/subscription` | crée la session d'abonnement → `{ url }` |
| `POST` | `/payment/org/:organisationId/checkout/credits` | crée la session d'achat de crédits → `{ url }` |
| `POST` | `/payment/org/:organisationId/portal` | portail de facturation Stripe → `{ url }` |
| `POST` | `/payment/webhook/stripe` | **webhook Stripe** (pas d'auth, signature vérifiée) |

Le frontend redirige l'utilisateur vers l'`url` Stripe Checkout renvoyée. Le
forfait/les crédits ne sont **appliqués qu'au webhook** (source de vérité), jamais
côté client.

## Webhooks gérés

- `checkout.session.completed` — active la souscription (forfait, période,
  `Organisation.plan`) ou crédite les crédits achetés ; marque le `Payment` COMPLETED.
- `invoice.paid` — met à jour la période et enregistre un `Payment` de
  renouvellement (idempotent via `stripeInvoiceId`).
- `customer.subscription.updated` — synchronise statut / `cancelAtPeriodEnd` / période.
- `customer.subscription.deleted` — rebascule l'organisation en `FREE`.
- `payment_intent.payment_failed` — marque le `Payment` correspondant FAILED.

## Quota de crédits

`GET /stats/org/:id/credits` renvoie désormais :
`total = crédits de base du forfait + purchasedCredits`, plus `plan`,
`monthlyCredits` et `purchasedCredits`. Le quota n'est donc plus le `10 000`
codé en dur d'avant, mais reflète le forfait réellement actif (issue #101).

## Configuration

Variables d'environnement (cf. `.env.example`) :

```bash
STRIPE_SECRET_KEY=sk_test_...      # clé secrète Stripe
STRIPE_WEBHOOK_SECRET=whsec_...    # secret de signature du webhook
FRONTEND_URL=https://...           # base des URLs de retour (success/cancel)
```

Tester les webhooks en local :

```bash
stripe listen --forward-to localhost:3005/payment/webhook/stripe
# copier le whsec_... affiché dans STRIPE_WEBHOOK_SECRET
```

## Reste à brancher côté frontend

La page « Souscriptions » (`plan.tsx`) doit appeler ces endpoints via `$api` et
rediriger vers l'`url` Stripe. Après modification du Swagger, régénérer les types :

```bash
npx openapi-typescript apps/backend/swagger-output/swagger.json -o apps/frontend/src/app/lib/api/v1.d.ts
```

## Limite connue

Les crédits achetés (`purchasedCredits`) s'ajoutent au quota mais leur
**décrément à la consommation** (puiser dans le solde acheté une fois le quota de
base dépassé, report mensuel) n'est pas encore implémenté — à traiter dans un
second temps via le `CreditService`.
