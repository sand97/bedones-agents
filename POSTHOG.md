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
| `POSTHOG_PROJECT_TOKEN` | backend | Clé projet. Vide ⇒ PostHog désactivé (no-op). |
| `POSTHOG_HOST` | backend | `https://us.i.posthog.com` (région US). |
| `POSTHOG_CAPTURE_INFO_LOGS` | backend | `true` pour aussi remonter les logs `info` (défaut `false`). |
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
- **Webhook ↔ conversation** → event `webhook_conversation`. Une fois la
  conversation résolue pendant le traitement (message, écho, réaction, accusé de
  réception), on émet un event par couple (webhook, conversation) avec
  `conversation_id`, `provider`, `social_account_id`, `event_type`
  (`message` / `echo` / `reaction` / `status`) et le `request_id` du
  `webhook_received` d'origine. ⇒ **filtrer par `conversation_id` pour voir tous
  les webhooks reçus sur une conversation donnée.** Émis depuis
  `WebhookService.trackConversationWebhook()`.
- **Appels API** → event `api_request` (route, méthode, statut, latence,
  `request_id`, user). Émis par un **middleware** `res.on('finish')`
  (`posthog-http.middleware.ts`) → couvre **toutes** les réponses, y compris les
  401/403/404/500 (un interceptor Nest, lui, tourne après les guards et raterait
  les requêtes rejetées par l'auth).
- **Logs applicatifs** → le logger Nest est remplacé par `PostHogLoggerService` :
  - `this.logger.error(..., error)` avec une vraie `Error` ⇒ **Error tracking**.
  - les lignes `error` / `warn` (et `info` si activé) ⇒ event `backend_log`.
  - Chaque log est enrichi du contexte d'exécution (`request_id`, route, user)
    grâce à un `AsyncLocalStorage` (`request-context.ts`).
  - **Corrélation conversation** : pendant le traitement d'un webhook, dès que la
    conversation est connue, `setRequestContext()` ajoute `conversation_id`,
    `social_account_id` et `provider` au contexte ⇒ **toutes** les lignes de
    `backend_log` du reste de l'exécution (y compris les listeners synchrones
    `message.incoming` : langue du contact, fidélité) deviennent cherchables par
    `conversation_id`.
  - **Run d'agent (worker BullMQ)** : le run live tourne sur la file
    `message-processing`, hors du scope HTTP du webhook. Le worker rouvre donc un
    scope via `runWithContext()` (`conversation_id`, `provider`,
    `social_account_id`, `source = 'agent-message-processing'`, `request_id`
    propre au run) ⇒ les logs du run d'agent sont eux aussi cherchables par
    conversation, et distinguables de l'ingestion via la propriété `source`.
- **Exceptions** : les 500 non gérés sont loggués par le filtre d'exception Nest
  par défaut ⇒ remontés en **Error tracking** via `PostHogLoggerService`.
- **Observabilité LLM** (agent LangChain / LangGraph, Gemini + OpenAI) : le
  `LlmFactoryService` attache le `LangChainCallbackHandler` de `@posthog/ai`.
  Chaque appel LLM est tracé (tokens, **coût**, latence, prompts/réponses,
  erreurs). On ne se limite **pas au budget** : chaque génération est attribuée
  via le helper `buildLlmTrace()` (`common/llm/llm-trace.ts`) qui pose une
  convention unique sur tous les call sites :
  - **`distinctId` = id de l'organisation** ⇒ l'insight *Generative AI users*
    compte de vrais comptes, plus un seul `backend-agent`. Repli sur
    `backend:<feature>` quand aucune org n'est en contexte (tâches internes).
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
- **Logs** : recherche plein-texte sur `backend_log.message`, filtrée par
  `logger_context`, `request_id` (corrélation log ↔ requête ↔ user) ou
  `conversation_id` (tous les logs d'une conversation).
- **Debug d'une conversation** (le cas d'usage qui motive `conversation_id`) :
  1. **Tous les webhooks reçus sur la conversation** → event `webhook_conversation`
     filtré par `conversation_id`, trié par date. Chaque ligne porte son
     `event_type` et son `request_id`.
  2. **Les logs liés à l'exécution de chaque webhook** → event `backend_log`
     filtré par le même `request_id` (l'exécution d'ingestion de CE webhook), ou
     par `conversation_id` pour voir toute la conversation d'un coup.
  3. **Séparer ingestion et run d'agent** → filtrer `backend_log` par
     `source` (`agent-message-processing` = le run live déclenché par le webhook).
     Combiné aux **LLM traces** (déjà taggées `conversationId`), on a la conversation
     de bout en bout : webhook → ingestion → run d'agent → appels modèle.

## 5. Suggestions (debug & marketing) pour plus tard

Déjà branché : product analytics, session replay, error tracking, LLM
observability (traces + users + coût, attribués par org — voir §3), logs
serveur, **reverse proxy** (anti ad-blockers). Pistes complémentaires utiles :

- **Feature flags** : déploiements progressifs / kill-switch d'une feature
  agent. `posthog-js/react` expose déjà `useFeatureFlagEnabled`.
- **Surveys** : NPS / feedback in-app ciblé (ex. après N tickets traités).
- **Group analytics organisation** : enrichir les groupes (plan, taille) pour
  des dashboards d'usage B2B.
