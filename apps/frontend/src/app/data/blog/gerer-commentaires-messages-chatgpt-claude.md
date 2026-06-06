---
title: "Gérer ses commentaires et messages Facebook, WhatsApp, Instagram et TikTok avec ChatGPT ou Claude"
slug: "gerer-commentaires-messages-chatgpt-claude"
excerpt: "Connectez Bedones à ChatGPT ou Claude et pilotez vos DM et commentaires de tous vos réseaux directement depuis votre IA. Guide d'installation pas à pas."
date: "2026-06-06"
readTime: "5 min"
category: "IA"
metaDescription: "Connectez Bedones à ChatGPT et Claude pour gérer commentaires et messages WhatsApp, Instagram, Facebook et TikTok depuis l'IA. Installation, dépannage, exemples."
keywords: "connecteur ChatGPT, connecteur Claude, MCP, gérer WhatsApp avec ChatGPT, répondre commentaires Facebook IA, Bedones, custom connector"
---

## Et si vous gériez tous vos réseaux depuis ChatGPT ou Claude ?

Vous utilisez déjà ChatGPT ou Claude tous les jours. Bedones leur ouvre une porte : **lire et répondre à vos messages et commentaires** sur WhatsApp, Instagram, Facebook et TikTok — sans quitter votre conversation avec l'IA.

Concrètement, vous tapez *« Montre mes messages WhatsApp non lus »* ou *« Réponds au commentaire qui demande notre adresse »*, et l'IA le fait dans Bedones, sur vos vrais comptes.

C'est possible grâce à un standard ouvert appelé **MCP (Model Context Protocol)**. Si vous voulez comprendre ce qui se passe sous le capot, lisez [Comment fonctionne le connecteur MCP de Bedones](/blog/comment-fonctionne-mcp-bedones).

## Ce dont vous avez besoin

- Un compte **Bedones** avec au moins un réseau connecté (WhatsApp, Facebook, Instagram ou TikTok).
- Un compte **ChatGPT** (mode développeur / connecteurs activé) **ou** **Claude** (Pro/Team/Enterprise).
- L'adresse du connecteur Bedones : **https://api-moderator.bedones.com/mcp**

## Connecter Bedones à Claude

- **Étape 1 —** Ouvrez Claude → **Settings → Connectors**.
- **Étape 2 —** Cliquez sur **Add custom connector**.
- **Étape 3 —** Collez l'URL **https://api-moderator.bedones.com/mcp** et validez.
- **Étape 4 —** Claude vous redirige vers l'écran Bedones **« Autoriser l'accès IA »**. Connectez-vous, choisissez votre **organisation**, puis cliquez **Autoriser**.
- **Étape 5 —** C'est prêt. Demandez par exemple *« Liste mes comptes sociaux connectés »*.

## Connecter Bedones à ChatGPT

- **Étape 1 —** Ouvrez ChatGPT → **Settings → Connectors** (mode développeur activé).
- **Étape 2 —** Choisissez **Add custom connector / Server URL**.
- **Étape 3 —** Collez **https://api-moderator.bedones.com/mcp**, type d'authentification **OAuth**.
- **Étape 4 —** Cliquez **Create**, puis autorisez l'accès et sélectionnez votre organisation sur l'écran Bedones.
- **Étape 5 —** Testez avec *« Quels messages attendent une réponse ? »*

## Vous ne trouvez pas « Bedones » dans la liste ? Pas de panique

Selon votre pays, votre formule ou la date, l'application Bedones peut **ne pas encore être visible** dans le répertoire public de ChatGPT ou Claude. Ce n'est pas un problème : vous pouvez l'ajouter **manuellement** en tant que **connecteur personnalisé** (custom connector). Le résultat est exactement le même.

- Dans **Claude** : Settings → Connectors → **Add custom connector** → collez **https://api-moderator.bedones.com/mcp**.
- Dans **ChatGPT** : Settings → Connectors → **Add custom connector** (ou « Create »), choisissez **Server URL**, collez la même adresse, authentification **OAuth**, puis **Create**.

Dans les deux cas, l'IA découvre toute seule la configuration et lance la connexion sécurisée. Vous n'avez **rien d'autre à configurer**.

## Ce que vous pouvez demander

- *« Montre mes conversations non lues sur tous les réseaux »*
- *« Réponds au dernier message de Marie sur WhatsApp avec nos horaires »*
- *« Masque les commentaires spam sur ma dernière publication Facebook »*
- *« Trouve la robe rouge dans le catalogue et envoie-la dans cette conversation »*
- *« Crée un ticket prioritaire pour cette demande de remboursement »*
- *« Ajoute une FAQ : quand on demande le numéro, réponds +237 6 57 88 86 90 »*

## Est-ce sécurisé ?

Oui. La connexion passe par **OAuth 2.0** : c'est **vous** qui vous connectez à Bedones et qui cliquez sur « Autoriser ». L'IA n'a accès qu'à l'**organisation que vous avez choisie**, et jamais à vos mots de passe ni à vos jetons de réseaux sociaux. Vous pouvez révoquer l'accès à tout moment depuis ChatGPT ou Claude.

## Besoin d'aide ?

Écrivez-nous via la page de support de Bedones ou à l'adresse de contact de votre tableau de bord — on vous accompagne gratuitement pour la mise en place.
