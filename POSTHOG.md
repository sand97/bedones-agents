# PostHog — Analytics, logs, session replay & LLM observability

Intégration PostHog **propre** côté `backend` (NestJS) et `frontend` (TanStack
Start), en remplacement du setup initial du wizard (qui avait été posé par erreur
dans le microservice Python `services/image-cropper`, désormais nettoyé).

## 1. Le token est-il confidentiel ?

**Non.** `POSTHOG_PROJECT_TOKEN` / `VITE_POSTHOG_KEY` (le `phc_...`) est une **clé
de projet publique, en écriture seule**. Elle est conçue pour être exposée dans
le bundle navigateur : elle ne permet **que d'envoyer des events**, jamais de
lire des données. Aucun risque à la committer dans le code front.

> La seule clé à garder secrète est une **Personal API Key** (`phx_...`), qui
> elle donne accès en lecture à votre projet. On n'en utilise aucune ici.

Les `.env` restent malgré tout gitignorés (bonne hygiène, et `POSTHOG_HOST`
peut varier par environnement).

## 2. Configuration

| Variable | App | Rôle |
|---|---|---|
| `POSTHOG_PROJECT_TOKEN` | backend | Clé projet. Vide ⇒ PostHog désactivé (no-op) : ni events, ni logs. |
| `POSTHOG_HOST` | backend | `https://us.i.posthog.com` (région US). Sert aussi d'endpoint logs OTLP (`$POSTHOG_HOST/i/v1/logs`). |
| `POSTHOG_CAPTURE_INFO_LOGS` | backend | `true` pour aussi remonter les logs `info` vers **Logs** (défaut `false`). **À activer** pour voir le déroulé complet d'une conversation (les logs webhook/agent sont en `info`). |
| `OTEL_SERVICE_NAME` | backend | `service.name` dans PostHog → Logs (défaut `bedones-backend`). |
| `VITE_POSTHOG_KEY` | frontend | Même valeur que `POSTHOG_PROJECT_TOKEN`. Vide ⇒ désactivé. |
| `VITE_POSTHOG_HOST` | frontend | Domaine du **reverse proxy managé** (`https://post-moderator.bedones.com`) — anti ad-blockers. |

Voir `apps/backend/.env.example` et `apps/frontend/.env.example`.

## 3. Ce qui est tracké

### Backend (`apps/backend/src/posthog/`)

- **Webhooks entrants** → event `webhook_received` (Facebook, Instagram,
  WhatsApp, TikTok, catalog, catalog-migration). Inclut `provider`, `status`,
  `duration_ms`, `request_id` et un **résumé sans PII** du payload (`object`,
  `entry_count`, `fields`). Émis par le middleware HTTP au `res.finish` : c'est
  l'event « brut » d'arrivée, **avant** que le payload soit résolu en conversation.
- **Webhook ↔ conversation** → une fois la conversation résolue pendant le
  traitement (message, écho, réaction, accusé de réception),
  `WebhookService.trackConversationWebhook()` (1) enrichit le contexte
  d'exécution (cf. *Logs applicatifs* ci-dessous) puis (2) écrit une ligne de log
  repère `[webhook:<provider>] <event_type> → conversation <id>`. ⇒ dans
  **PostHog → Logs**, filtrer par l'attribut `conversation_id` (ou rechercher
  `[webhook:`) montre **tous les webhooks reçus sur une conversation donnée**,
  chacun partageant le `request_id` du reste des logs de son exécution.
- **Appels API** → event `api_request` (route, méthode, statut, latence,
  `request_id`, user). Émis par un **middleware** `res.on('finish')`
  (`posthog-http.middleware.ts`) → couvre **toutes** les réponses, y compris les
  401/403/404/500 (un interceptor Nest, lui, tourne après les guards et raterait
  les requêtes rejetées par l'auth).
- **Logs applicatifs** → le logger Nest est remplacé par `PostHogLoggerService`,
  qui envoie chaque ligne vers le **produit Logs** de PostHog (⚠️ **pas** la
  surface Events : le produit Logs n'est alimenté que par **OpenTelemetry/OTLP**
  sur `…/i/v1/logs` — un `posthog.capture()` n'y apparaît jamais). Pipeline
  logs-only dans `otel-logs.ts` (un `LoggerProvider` + `BatchLogRecordProcessor` +
  `OTLPLogExporter`, sans auto-instrumentation NodeSDK).
  - `this.logger.error(..., error)` avec une vraie `Error` ⇒ **Error tracking**
    (stack + grouping) **et** une ligne de log `error`.
  - `error` / `warn` (et `info` si `POSTHOG_CAPTURE_INFO_LOGS=true`) ⇒ un log
    OTLP (`severity_text`, `body` = message, `service.name`).
  - **Attributs cherchables** stampés sur chaque log depuis l'`AsyncLocalStorage`
    (`request-context.ts`) : `request_id`, `path`, `method`, `logger_context`,
    `source`, et surtout `conversation_id`, `contact_id`, `social_account_id`,
    `organisation_id`, `provider`. ⇒ on retrouve une conversation précise en
    recoupant n'importe lequel de ces axes dans **PostHog → Logs**.
  - **Corrélation conversation** : pendant le traitement d'un webhook, dès que la
    conversation est connue, `setRequestContext()` ajoute `conversation_id` /
    `contact_id` / `social_account_id` / `provider` au contexte ⇒ **toutes** les
    lignes du reste de l'exécution (y compris les listeners synchrones
    `message.incoming` : langue du contact, fidélité) portent ces attributs.
  - **Run d'agent (worker BullMQ)** : le run live tourne sur la file
    `message-processing`, hors du scope HTTP du webhook. Le worker rouvre donc un
    scope via `runWithContext()` (`conversation_id`, `contact_id`, `provider`,
    `social_account_id`, `source = 'agent-message-processing'`, `request_id`
    propre au run) ⇒ les logs du run d'agent sont eux aussi cherchables par
    conversation, et distinguables de l'ingestion via l'attribut `source`.
- **Exceptions** : les 500 non gérés sont loggués par le filtre d'exception Nest
  par défaut ⇒ remontés en **Error tracking** via `PostHogLoggerService`.
- **Observabilité LLM** (agent LangChain / LangGraph, Gemini + OpenAI) : le
  `LlmFactoryService` attache le `LangChainCallbackHandler` de `@posthog/ai`.
  Chaque appel LLM est tracé (tokens, **coût**, latence, prompts/réponses,
  erreurs). On ne se limite **pas au budget** : chaque génération est attribuée
  via le helper `buildLlmTrace()` (`common/llm/llm-trace.ts`) qui pose une
  convention unique sur tous les call sites :
  - **`distinctId` = la conversation** (son `conversationId`) ⇒ dans *Generative
    AI users*, **1 user = 1 conversation unique**. Une conversation est exactement
    une paire `(socialAccount, contact)` (`Conversation @@unique[socialAccountId,
    participantId]`) et regroupe tous les messages d'un échange — donc toutes les
    réponses d'IA d'un même client sur un même canal remontent à un seul user
    (et c'est le même id que `conversation_id` côté Logs). Repli sur l'**id de
    l'organisation** pour les tâches hors conversation (onboarding, analyse
    catalogue, error-explanation), puis `backend:<feature>`.
  - **`groups.organisation`** = id de l'org ⇒ même clé de group que le reste des
    events (analytics par org bout-en-bout).
  - **`traceId`** par run ⇒ tous les appels modèle d'un même tour d'agent (tool
    calls + fallback de provider inclus) sont regroupés en **une seule trace**.
  - **`properties`** : `feature` (`agent-live-response`, `agent-context`,
    `ticket-agent`, `agent-feedback`, `contact-language`,
    `product-context-analyze`, `comment-moderation`, `error-explanation`) +
    `conversationId`, `contactId`, `agentId`, `socialAccountId`, `provider`,
    `tier`, `catalogId` quand ils sont disponibles ⇒ filtrage fin dans l'UI.

  Visible dans **PostHog → LLM analytics** (Traces, Users, Generations, coût).

### Frontend (`apps/frontend/src/app/contexts/posthog-provider.tsx`)

- **Page views** sur chaque navigation TanStack Router (`$pageview`),
  utilisateur connecté **ou non**.
- **Session replay** activé. ⚠️ C'est un CRM : les `input`/`textarea`/`select`
  sont **masqués par défaut** (`maskAllInputs`). Pour masquer aussi du texte
  sensible (ex. panneau de conversation), ajouter `data-ph-mask` sur l'élément,
  ou `class="ph-no-capture"` pour exclure tout un sous-arbre du replay.
- **Identification** : à la résolution de `/auth/me` (lue depuis le cache React
  Query, **sans requête réseau supplémentaire**), `posthog.identify(user.id,…)`
  + `posthog.group('organisation', orgId)`. `reset()` au logout.
- **Error tracking** navigateur + dead clicks / heatmaps (via `defaults`).
- **Reverse proxy** : `api_host` pointe sur `post-moderator.bedones.com` (proxy
  managé PostHog) → events **et** assets (recorder du session replay, surveys)
  passent par notre domaine, donc non bloqués par les ad-blockers. `ui_host`
  reste `us.posthog.com` pour que les liens in-app pointent vers la vraie UI.
- **`person_profiles: 'identified_only'`** : pas de profil pour les visiteurs
  anonymes (moins cher + privacy) ; un profil est créé à l'`identify()`. Les
  page views anonymes restent capturées. Passer à `'always'` pour profiler aussi
  les anonymes.

> Les events backend et frontend partagent la même clé de group
> `organisation` = **id de l'organisation** ⇒ analytics par org cohérent
> bout-en-bout.

## 4. Idées d'insights (à créer dans l'UI PostHog)

- **Debug webhooks** : volume `webhook_received` par `provider` + taux d'erreur
  (`errored = true`). Repère un provider qui tombe.
- **Santé API** : p95 de `api_request.duration_ms` par `route` ; top routes en
  erreur (`status >= 500`).
- **Coût LLM** : dépense `$ai_generation` par `feature` et par organisation ;
  latence agent ; taux d'erreur des appels modèle.
- **Funnel onboarding** : `$pageview` `/auth/login` → `/create-organisation` →
  premier `/app/$orgSlug/dashboard`.
- **Debug d'une conversation** (le cas d'usage qui motive toute cette section) —
  tout se passe dans **PostHog → Logs** (produit Logs, pas Events), service
  `bedones-backend`. Penser à `POSTHOG_CAPTURE_INFO_LOGS=true` pour le déroulé
  complet (les logs webhook/agent sont en `info`) :
  1. **Cibler la conversation** : filtrer les logs par attribut `conversation_id`
     (ou recouper `organisation_id` / `contact_id` / `social_account_id` /
     `provider` quand on n'a pas l'id sous la main).
  2. **Tous les webhooks reçus sur la conversation** : dans ces résultats,
     rechercher `[webhook:` → une ligne par webhook (`message` / `echo` /
     `reaction` / `status`), chacune avec son `request_id`.
  3. **Les logs liés à l'exécution d'un webhook précis** : filtrer par le
     `request_id` de la ligne repère ⇒ uniquement les logs de CETTE exécution.
  4. **Séparer ingestion et run d'agent** : filtrer par l'attribut `source`
     (`agent-message-processing` = le run live déclenché par le webhook).
     Combiné aux **LLM traces** (déjà taggées `conversationId`), on a la
     conversation de bout en bout : webhook → ingestion → run d'agent → appels modèle.

## 5. Suggestions (debug & marketing) pour plus tard

Déjà branché : product analytics, session replay, error tracking, LLM
observability (traces + users + coût, attribués par org — voir §3), logs
serveur, **reverse proxy** (anti ad-blockers). Pistes complémentaires utiles :

- **Feature flags** : déploiements progressifs / kill-switch d'une feature
  agent. `posthog-js/react` expose déjà `useFeatureFlagEnabled`.
- **Surveys** : NPS / feedback in-app ciblé (ex. après N tickets traités).
- **Group analytics organisation** : enrichir les groupes (plan, taille) pour
  des dashboards d'usage B2B.
