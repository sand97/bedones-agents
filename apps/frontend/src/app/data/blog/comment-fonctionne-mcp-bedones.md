---
title: "Comment fonctionne le connecteur MCP de Bedones"
slug: "comment-fonctionne-mcp-bedones"
excerpt: "MCP, OAuth, tools… on vous explique simplement comment Bedones donne à ChatGPT et Claude un accès sécurisé à vos messages et commentaires."
date: "2026-06-05"
readTime: "4 min"
category: "IA"
metaDescription: "Comprendre le connecteur MCP de Bedones : le protocole MCP, la sécurité OAuth 2.0, les outils exposés et comment l'IA agit sur vos réseaux en toute sûreté."
keywords: "MCP, Model Context Protocol, connecteur IA, OAuth 2.0, ChatGPT connector, Claude connector, sécurité, Bedones"
---

## C'est quoi le MCP ?

**MCP (Model Context Protocol)** est un standard ouvert qui permet à une IA comme ChatGPT ou Claude de **se brancher à un outil externe** et d'y exécuter des actions. Au lieu d'être limitée à du texte, l'IA peut appeler de vraies fonctions — appelées **tools** — dans votre logiciel.

Bedones expose un **serveur MCP** : une porte d'entrée sécurisée par laquelle l'IA peut lire vos conversations, répondre, modérer des commentaires, gérer votre catalogue et vos tickets.

## Que peut faire l'IA, exactement ?

Le serveur Bedones publie une liste de tools, chacun avec une action précise et une étiquette claire (lecture seule ou modification). Par exemple :

- **Lecture** : lister les conversations, lire les messages, voir les commentaires, lister les produits, les tickets.
- **Écriture** : envoyer un message, répondre à un commentaire, masquer un commentaire, créer un ticket.
- **Configuration** : définir le contexte de votre agent IA, ajouter des règles FAQ, régler la modération.

Chaque outil est annoté pour que l'IA sache s'il **lit** ou s'il **modifie** quelque chose — et les actions destructrices (comme supprimer un commentaire) sont réservées aux administrateurs.

## La sécurité : c'est vous qui décidez

La connexion repose sur **OAuth 2.0**, le même standard que « Se connecter avec Google ».

- L'IA n'a **jamais** votre mot de passe.
- C'est **vous** qui vous authentifiez sur Bedones et qui cliquez sur **« Autoriser »**.
- Vous choisissez **l'organisation** à laquelle l'IA aura accès — et rien d'autre.
- Vos jetons d'accès aux réseaux sociaux (Meta, TikTok…) **ne sortent jamais** de Bedones.
- Vous pouvez **révoquer** l'accès à tout moment, en un clic, depuis ChatGPT ou Claude.

À chaque requête de l'IA, Bedones revérifie que vous avez toujours le droit d'agir sur cette organisation.

## Un seul connecteur, toutes vos plateformes

Le gros avantage : un **unique** connecteur Bedones donne à l'IA accès à **WhatsApp, Facebook, Instagram et TikTok** en même temps. Vous n'avez pas à brancher chaque réseau un par un dans l'IA — Bedones s'en charge déjà.

## Et concrètement, comment je l'active ?

Tout est expliqué pas à pas dans notre guide : [Gérer ses commentaires et messages avec ChatGPT ou Claude](/blog/gerer-commentaires-messages-chatgpt-claude).

En résumé : vous ajoutez l'adresse **https://api-moderator.bedones.com/mcp** comme connecteur dans ChatGPT ou Claude, vous autorisez, et c'est parti.
