#!/usr/bin/env bash
# Stop hook : à la fin de CHAQUE tâche, rappelle de vérifier qu'une PR est bien
# ouverte (ou déjà mergée) sur la branche de travail avant de terminer.
#
# Déclenché par le harness Claude Code (event "Stop"), pas par le modèle. Reçoit
# le JSON du hook sur stdin. Ne bloque QUE lorsqu'il y a réellement du travail à
# publier (des commits en avance sur la branche de base) ; sinon il laisse passer.
#
# Pas de gh CLI / API GitHub ici : le hook ne peut pas LIRE l'état des PR. Il
# renvoie donc un rappel textuel (decision:block) que le modèle doit traiter en
# ouvrant la PR si elle n'existe pas, ou en confirmant qu'elle est déjà ouverte.
set -euo pipefail

input="$(cat 2>/dev/null || true)"

# Anti-boucle : après un block, le harness relance le modèle puis re-déclenche le
# Stop hook avec stop_hook_active=true. On ne bloque pas une 2e fois d'affilée.
if printf '%s' "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
case "$branch" in
  main | master | HEAD | '') exit 0 ;; # sur la base ou détaché → rien à publier
esac

# Branche de base : origin/HEAD si dispo, sinon origin/main, sinon main.
base="$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/@@' || true)"
[ -z "$base" ] && base="origin/main"
git rev-parse --verify "$base" >/dev/null 2>&1 || base="main"
git rev-parse --verify "$base" >/dev/null 2>&1 || exit 0

ahead="$(git rev-list --count "$base..HEAD" 2>/dev/null || echo 0)"
[ "${ahead:-0}" -gt 0 ] || exit 0 # aucune avance → pas de PR à vérifier

reason="Vérification de fin de tâche : la branche \"$branch\" a $ahead commit(s) d'avance sur $base. AVANT de terminer, vérifie qu'une PR est OUVERTE (ou déjà mergée) pour cette branche. Si aucune PR n'est ouverte, ouvre-la MAINTENANT sans demander la permission (règle CLAUDE.md). Si elle est déjà ouverte ou mergée, confirme-le en une ligne puis termine."

jq -cn --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
