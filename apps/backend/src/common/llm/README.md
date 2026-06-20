# LLM — Configuration des providers (env)

Le `LlmFactoryService` construit chaque modèle de chat à partir d'un **provider
primaire** + les autres en **fallback automatique** (seuls ceux dont la clé API
est renseignée sont utilisés).

Trois providers sont supportés :

| Provider | Valeur | Détail |
| --- | --- | --- |
| Google Gemini | `gemini` | Défaut historique |
| OpenAI / ChatGPT | `openai` | — |
| Xiaomi MiMo | `xiaomi` | API compatible OpenAI (via `XIAOMI_BASE_URL`) |

## 1. Choix du provider

Le provider est résolu **par cas d'usage**, ce qui permet par ex. de garder
Gemini pour la configuration de l'agent et de répondre aux clients sur le bien
moins cher Xiaomi MiMo.

| Variable | Défaut | Cas d'usage | Valeurs |
| --- | --- | --- | --- |
| `LLM_DEFAULT_PROVIDER` | `gemini` | Défaut global (fallback des deux ci-dessous) | `gemini` \| `openai` \| `xiaomi` |
| `LLM_PROVIDER_THINKING` | `LLM_DEFAULT_PROVIDER` | **Configuration de l'agent** (tier `thinking` : onboarding, analyse catalogue, feedback, décision ticket) | idem |
| `LLM_PROVIDER_LIVE` | `LLM_DEFAULT_PROVIDER` | **Réponse aux messages** (agent live, tiers `flash`/`pro`/`ultra`) | idem |

> Une valeur inconnue/invalide est ignorée et retombe sur le défaut.

## 2. Clés API & endpoints

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `GEMINI_API_KEY` | _(vide)_ | Active Gemini si renseignée |
| `OPENAI_API_KEY` | _(vide)_ | Active OpenAI si renseignée |
| `XIAOMI_API_KEY` | _(vide)_ | Active Xiaomi MiMo si renseignée (format `sk-xxxxx`) |
| `XIAOMI_BASE_URL` | `https://api.xiaomimimo.com/v1` | Endpoint OpenAI-compatible de MiMo |

## 3. Modèles par tier

Quatre tiers : `thinking` (config), `flash` (réponse rapide), `pro` (flash +
raisonnement), `ultra` (le plus capable). Chaque tier a un modèle par provider,
surchargeable :

| Variable | Défaut |
| --- | --- |
| `GEMINI_MODEL_THINKING` | `gemini-3.1-pro-preview` |
| `GEMINI_MODEL_FLASH` | `gemini-3-flash-preview` |
| `GEMINI_MODEL_PRO` | `gemini-3-flash-preview` |
| `GEMINI_MODEL_ULTRA` | `gemini-3.1-pro-preview` |
| `OPENAI_MODEL_THINKING` | `gpt-5` |
| `OPENAI_MODEL_FLASH` | `gpt-5-mini` |
| `OPENAI_MODEL_PRO` | `gpt-5-mini` |
| `OPENAI_MODEL_ULTRA` | `gpt-5` |
| `XIAOMI_MODEL_THINKING` | `mimo-v2.5-pro` |
| `XIAOMI_MODEL_FLASH` | `mimo-v2.5` |
| `XIAOMI_MODEL_PRO` | `mimo-v2.5-pro` |
| `XIAOMI_MODEL_ULTRA` | `mimo-v2.5-pro` |

## 4. Raisonnement / thinking

| Variable | Défaut | Provider | Effet |
| --- | --- | --- | --- |
| `GEMINI_THINKING_BUDGET` | `0` sur `flash`, sinon `-1` | Gemini | Budget de thinking (`-1` = dynamique, `0` = off) |
| `OPENAI_REASONING_EFFORT` | `medium` | OpenAI | `minimal` \| `low` \| `medium` \| `high` ; appliqué à tous les tiers sauf `flash` |

> Xiaomi MiMo n'envoie **pas** le paramètre `reasoning` propre à OpenAI (un
> endpoint non-OpenAI pourrait le rejeter).

## 5. Limites de l'agent live

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `AGENT_MAX_OUTPUT_TOKENS` | _(per-tier)_ | Plafond global de tokens de sortie par tour |
| `AGENT_MAX_OUTPUT_TOKENS_FLASH` | `2048` | Override tier flash |
| `AGENT_MAX_OUTPUT_TOKENS_PRO` | `8192` | Override tier pro |
| `AGENT_MAX_OUTPUT_TOKENS_ULTRA` | `16384` | Override tier ultra |
| `AGENT_HISTORY_LIMIT` | `40` | Profondeur d'historique chargée dans le contexte |
| `AGENT_HISTORY_LIMIT_FLASH` / `_PRO` / `_ULTRA` | `AGENT_HISTORY_LIMIT` | Override par tier |
| `AGENT_MODEL_CALL_LIMIT` | `6` | Nombre max d'appels modèle par tour d'agent |
| `AGENT_EMBEDDING_MODEL` | `text-embedding-3-small` | Modèle d'embedding |

## 6. Variables dépréciées

| Variable | Remplacée par | Note |
| --- | --- | --- |
| `OPENIA_API_KEY` | `OPENAI_API_KEY` | Ancienne faute de frappe encore lue en **fallback** par `buildOpenAI()`. Ne plus l'utiliser ; migrer vers `OPENAI_API_KEY`. |

---

### Exemple : config sur Gemini, réponses clients sur MiMo

```env
LLM_DEFAULT_PROVIDER=gemini
LLM_PROVIDER_THINKING=gemini      # onboarding / analyse → qualité
LLM_PROVIDER_LIVE=xiaomi          # réponses clients → coût minimal

GEMINI_API_KEY=AI...
XIAOMI_API_KEY=sk-...
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
```
