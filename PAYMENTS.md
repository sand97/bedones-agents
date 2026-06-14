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
| `POST` | `/payment/webhook/stripe` | **webhook Stripe production** (pas d'auth, signature vérifiée) |
| `POST` | `/payment/webhook/stripe-sandbox` | **webhook Stripe sandbox** (pas d'auth, signature vérifiée) |
| `POST` | `/payment/webhook/notchpay` | **webhook NotchPay** mobile money (pas d'auth, signature vérifiée) |

Le frontend redirige l'utilisateur vers l'`url` Stripe Checkout renvoyée. Le
forfait/les crédits ne sont **appliqués qu'au webhook** (source de vérité), jamais
côté client.

## Prestataires & méthodes de paiement

Le checkout accepte un `method` :

- **`CARD` → Stripe** : abonnement **récurrent** (renouvellement automatique).
- **`MOBILE_MONEY` → NotchPay** : paiement **ponctuel** (Orange Money / MTN MoMo).
  La souscription mobile donne un **accès à durée fixe** (`billingMonths`),
  `autoRenew = false`, **sans renouvellement automatique** : un cron quotidien la
  fait expirer à `currentPeriodEnd` (retour en `FREE`) et l'utilisateur doit
  re-payer manuellement — d'où les rappels WhatsApp avant échéance (à venir).

Les deux méthodes renvoient une `url` de paiement (Stripe Checkout ou NotchPay)
vers laquelle rediriger. L'application du forfait/des crédits se fait au **webhook**.

### NotchPay (mobile money)

- Endpoint webhook : **`POST /payment/webhook/notchpay`** (signature
  `x-notch-signature` = HMAC-SHA256 du corps brut avec `NOTCHPAY_HASH`).
- Activation au webhook `payment.complete` : crédite (CREDIT_PURCHASE) ou active
  l'accès à durée fixe (SUBSCRIPTION). Idempotent via la transition
  `PENDING → COMPLETED` de la ligne `Payment` (réf. = `notchpayReference`).
- Cron d'expiration : `expireSubscriptions()` (BullMQ repeatable, `PAYMENT_EXPIRY_CRON`)
  fait expirer les accès `autoRenew = false` arrivés à échéance et émet
  l'événement `subscription.expired` (point d'intégration des notifications).
- ⚠️ Le contrat d'API NotchPay (endpoints, signature, devise XAF + taux de change
  USD→XAF) est **configurable et à vérifier** avec le compte réel — voir
  `notchpay.service.ts` et les variables `NOTCHPAY_*`.

## Notifications WhatsApp d'abonnement

Envoyées depuis le numéro CORE Bedones (`CORE_WHATSAPP_NUMBER_ID` + `META_SYSTEM_USER`)
via des templates Meta approuvés. Service : `subscription-notification.service.ts`.

| Flux | Quand | Cible | Template (env) |
|---|---|---|---|
| **A. Rappel d'échéance** | J-`PAYMENT_REMINDER_DAYS_BEFORE` avant la fin, **mobile money** uniquement | payeur (fallback OWNER) | `payment_due_reminder` |
| **B. Enquête de départ** | abonnement terminé (non-renouvellement mobile, ou annulation volontaire carte) | payeur / OWNER | `feedback_survey_form_1` (Flow) |
| **C. Échec de paiement** | abonnement carte terminé pour échec de paiement (`cancellation_details.reason = payment_failure`) | payeur / OWNER | `payment_failed_4` |

- Le rappel A part du **cron quotidien** (`PaymentProcessor`), une seule fois par
  période (`Subscription.lastReminderSentAt`).
- B/C réagissent à l'événement interne `subscription.ended` (émis par
  `expireSubscriptions` et par le webhook Stripe `customer.subscription.deleted`).
- Le destinataire est le **payeur** (`Subscription.payerUserId`), avec repli sur le
  **OWNER** de l'org ayant un téléphone.

### Réponses du WhatsApp Flow (enquête de départ B)

Quand l'utilisateur soumet le Flow `feedback_survey_form_1`, Meta envoie au numéro
CORE un message entrant **`interactive` de type `nfm_reply`** :

```jsonc
{ "messages": [ {
  "type": "interactive",
  "interactive": { "type": "nfm_reply", "nfm_reply": {
    "name": "flow", "body": "Sent",
    "response_json": "{\"flow_token\":\"churn:<orgId>\",\"q1\":\"...\"}"  // string JSON
  } }
} ] }
```

`webhook.service` extrait `response_json` et l'émet via `whatsapp.core.inbound`
(`flowResponseJson`). Le service de notif le parse, retrouve l'org via le
`flow_token` (préfixe `churn:`), et stocke la soumission dans
`ChurnSurveyResponse`. **Affichage côté app** : `GET /payment/org/:id/churn-responses`
renvoie ces réponses (le champ `response` = `response_json` parsé, à mapper sur les
intitulés des questions de ton Flow).

> ⚠️ À confirmer par un envoi réel : l'ordre exact des variables de corps des
> templates, le type des boutons (URL **dynamique** vs statique ; bouton **Flow**),
> et le passage du `flow_token`. Tout est centralisé/configurable dans
> `subscription-notification.service.ts` + `notification.config.ts`.

## Modes Stripe (production / sandbox)

Deux environnements Stripe coexistent, chacun avec ses clés et son secret webhook :

- **Sortant** (création de checkouts) : `STRIPE_MODE` (`sandbox` | `production`,
  défaut `production`) choisit l'environnement actif.
- **Webhooks** : routés par endpoint et vérifiés avec le secret du mode —
  `/payment/webhook/stripe` (production) et `/payment/webhook/stripe-sandbox`
  (sandbox). Le client Stripe utilisé pendant le traitement (ex.
  `subscriptions.retrieve`) correspond au mode de l'endpoint.

## Webhooks gérés

- `checkout.session.completed` — active la souscription (forfait, période,
  `Organisation.plan`) ou crédite les crédits achetés ; marque le `Payment` COMPLETED.
- `payment_intent.succeeded` — **filet de sécurité pour l'achat de crédits** :
  crédite même si `checkout.session.completed` est manqué. Idempotent (cf. plus bas) :
  aucun double crédit si les deux events arrivent.
- `invoice.paid` — met à jour la période et enregistre un `Payment` de
  renouvellement (idempotent via `stripeInvoiceId`).
- `customer.subscription.updated` — synchronise statut / `cancelAtPeriodEnd` / période.
- `customer.subscription.deleted` — rebascule l'organisation en `FREE`.
- `payment_intent.payment_failed` — marque le `Payment` correspondant FAILED.

### Crédit exactement-une-fois (idempotence)

L'achat de crédits peut être confirmé par `checkout.session.completed` **et/ou**
`payment_intent.succeeded` (et chacun peut être rejoué par Stripe). La ligne
`Payment` sert d'**ancre d'idempotence** : son id est propagé sur la session **et**
sur le PaymentIntent (`payment_intent_data.metadata.paymentId`). Le crédit n'est
appliqué que lors de la transition atomique `PENDING → COMPLETED`
(`updateMany` filtré sur `status: PENDING`) ; une seule transaction gagne la
course et incrémente `purchasedCredits`. **Aucun double crédit possible**, quel
que soit l'event déclencheur ou l'ordre d'arrivée.

> Le crédit ne dépend jamais du `success_url` (redirection navigateur) : Stripe
> envoie les webhooks de serveur à serveur, que l'utilisateur revienne ou non.

## Quota de crédits

`GET /stats/org/:id/credits` renvoie désormais :
`total = crédits de base du forfait + purchasedCredits`, plus `plan`,
`monthlyCredits` et `purchasedCredits`. Le quota n'est donc plus le `10 000`
codé en dur d'avant, mais reflète le forfait réellement actif (issue #101).

## Configuration

Variables d'environnement (cf. `.env.example`) :

```bash
STRIPE_MODE=production                 # sandbox | production (défaut: production)
# Production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Sandbox
STRIPE_SANDBOX_SECRET_KEY=sk_test_...
STRIPE_SANDBOX_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://...               # base des URLs de retour (success/cancel)
```

Tester les webhooks sandbox en local :

```bash
stripe listen --forward-to localhost:3005/payment/webhook/stripe-sandbox
# copier le whsec_... affiché dans STRIPE_SANDBOX_WEBHOOK_SECRET, et STRIPE_MODE=sandbox
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
