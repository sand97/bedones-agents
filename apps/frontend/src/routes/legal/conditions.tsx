import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/conditions')({
  component: ConditionsVentePage,
})

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Title level={5} className="mt-10 first:mt-0" style={{ marginBottom: 8 }}>
      {children}
    </Title>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <Text className="mb-4 block leading-relaxed text-text-secondary">{children}</Text>
}

function ConditionsVentePage() {
  return (
    <div className="legal-public">
      <div className="legal-public__container">
        <a href="/" className="legal-public__back">
          <ArrowLeft size={16} />
          <span>Retour</span>
        </a>

        <div className="legal-public__header">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-bold text-white">B</span>
            </div>
            <span className="text-lg font-semibold">Bedones</span>
          </div>
          <Title level={2} style={{ margin: 0, marginTop: 16 }}>
            Conditions générales de vente
          </Title>
          <Text type="secondary">Dernière mise à jour : 1er avril 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Objet</SectionTitle>
          <P>
            Les présentes Conditions Générales de Vente (CGV) régissent l&apos;ensemble des
            relations contractuelles entre Bedones SAS (ci-après « Bedones ») et toute personne
            physique ou morale souscrivant à un abonnement à la plateforme Bedones (ci-après « le
            Client »).
          </P>

          <SectionTitle>2. Description des services</SectionTitle>
          <P>
            Bedones fournit une plateforme SaaS de gestion intelligente des interactions sociales
            pour les entreprises. Les services incluent :
          </P>
          <P>
            — <strong>Connexion multi-canaux :</strong> intégration de vos comptes WhatsApp
            Business, Instagram, Facebook, TikTok et Messenger dans une interface unifiée.
            <br />— <strong>Agents IA conversationnels :</strong> configuration d&apos;agents
            intelligents capables de répondre automatiquement aux messages et commentaires de vos
            clients, selon les règles et le ton que vous définissez.
            <br />— <strong>Gestion des commandes :</strong> prise de commandes automatisée via les
            conversations, avec création et suivi de tickets.
            <br />— <strong>Modération des commentaires :</strong> surveillance et modération
            automatique des commentaires sur vos publications Facebook, Instagram et TikTok.
            <br />— <strong>Catalogue produits :</strong> gestion centralisée de votre catalogue,
            accessible par les agents pour présenter vos produits aux clients.
            <br />— <strong>Tableau de bord et statistiques :</strong> suivi des performances de vos
            agents, volume d&apos;interactions, taux de conversion et satisfaction client.
          </P>

          <SectionTitle>3. Souscription et accès</SectionTitle>
          <P>
            L&apos;accès à la plateforme nécessite la création d&apos;un compte et la souscription à
            l&apos;un des plans tarifaires proposés. Le Client s&apos;engage à fournir des
            informations exactes lors de son inscription et à maintenir la confidentialité de ses
            identifiants de connexion.
          </P>
          <P>
            L&apos;abonnement prend effet dès la validation du paiement. Le Client peut inviter des
            membres de son organisation à accéder à la plateforme selon les limites de son plan.
          </P>

          <SectionTitle>4. Tarification</SectionTitle>
          <P>
            Les tarifs des différents plans sont affichés sur la page Tarifs de la plateforme et
            peuvent être modifiés à tout moment. Toute modification tarifaire sera notifiée au
            Client au moins 30 jours avant son entrée en vigueur et ne s&apos;appliquera qu&apos;au
            prochain renouvellement de l&apos;abonnement.
          </P>
          <P>
            Les prix sont indiqués en francs CFA (XOF) ou en euros (EUR) selon la localisation du
            Client, hors taxes applicables. Le Client est responsable du paiement des taxes en
            vigueur dans son pays.
          </P>

          <SectionTitle>5. Modalités de paiement</SectionTitle>
          <P>
            Le paiement s&apos;effectue par carte bancaire, virement ou mobile money selon les
            moyens disponibles dans votre région. La facturation est récurrente, mensuelle ou
            annuelle selon le plan choisi. Le paiement est exigible à chaque date de renouvellement.
          </P>
          <P>
            En cas de non-paiement dans les 7 jours suivant la date d&apos;échéance, Bedones se
            réserve le droit de suspendre l&apos;accès au service. Les agents IA seront désactivés
            et les messages entrants ne seront plus traités automatiquement. L&apos;accès sera
            rétabli dans les 24 heures suivant la régularisation du paiement.
          </P>

          <SectionTitle>6. Engagement et durée</SectionTitle>
          <P>
            Les abonnements mensuels sont sans engagement de durée. Les abonnements annuels sont
            souscrits pour une durée de 12 mois et sont renouvelés tacitement à chaque date
            anniversaire, sauf résiliation dans les conditions prévues à l&apos;article 7.
          </P>

          <SectionTitle>7. Résiliation</SectionTitle>
          <P>
            <strong>Abonnement mensuel :</strong> le Client peut résilier à tout moment depuis les
            paramètres de son compte. La résiliation prend effet à la fin de la période mensuelle en
            cours. Le service reste accessible jusqu&apos;à cette date.
          </P>
          <P>
            <strong>Abonnement annuel :</strong> le Client peut demander la résiliation au moins 30
            jours avant la date de renouvellement. Aucun remboursement prorata temporis ne sera
            effectué pour la période restante.
          </P>
          <P>
            <strong>Résiliation par Bedones :</strong> Bedones se réserve le droit de résilier
            l&apos;abonnement d&apos;un Client en cas de violation des présentes CGV,
            d&apos;utilisation abusive du service, ou d&apos;activités contraires aux conditions
            d&apos;utilisation des plateformes tierces (Meta, TikTok). Le Client sera notifié par
            email 15 jours avant la résiliation effective, sauf en cas de manquement grave.
          </P>

          <SectionTitle>8. Niveau de service (SLA)</SectionTitle>
          <P>
            Bedones s&apos;engage à maintenir une disponibilité de la plateforme de 99,5 % par mois
            calendaire, hors maintenances programmées et interruptions des API tierces (Meta,
            TikTok, WhatsApp). Les maintenances programmées seront communiquées au moins 48 heures à
            l&apos;avance.
          </P>

          <SectionTitle>9. Responsabilité</SectionTitle>
          <P>
            Bedones s&apos;engage à fournir ses services avec diligence et conformément aux règles
            de l&apos;art. Toutefois, Bedones ne saurait être tenu responsable :
          </P>
          <P>
            — Des interruptions de service imputables aux fournisseurs tiers (Meta, TikTok,
            WhatsApp, AWS) ou aux opérateurs de télécommunications.
            <br />
            — Des réponses générées par les agents IA, dont le contenu dépend de la configuration
            définie par le Client et des données disponibles.
            <br />
            — Des pertes de chiffre d&apos;affaires ou de clientèle résultant d&apos;interactions
            automatisées mal configurées par le Client.
            <br />— De la conformité des messages automatiques avec la réglementation applicable
            dans le pays du Client (publicité, protection du consommateur).
          </P>
          <P>
            En tout état de cause, la responsabilité totale de Bedones ne pourra excéder le montant
            des sommes versées par le Client au cours des 12 derniers mois précédant
            l&apos;événement générateur de responsabilité.
          </P>

          <SectionTitle>10. Obligations du Client</SectionTitle>
          <P>
            Le Client s&apos;engage à :<br />
            — Utiliser la plateforme conformément aux présentes CGV et à la réglementation
            applicable.
            <br />
            — Configurer ses agents IA de manière responsable et s&apos;assurer que les réponses
            automatiques respectent la législation en vigueur.
            <br />
            — Ne pas utiliser le service pour envoyer du spam, du contenu illicite ou des
            communications commerciales non sollicitées.
            <br />
            — Respecter les conditions d&apos;utilisation des plateformes tierces sur lesquelles ses
            comptes sont connectés.
            <br />— Maintenir à jour les informations de son compte et ses moyens de paiement.
          </P>

          <SectionTitle>11. Propriété des données</SectionTitle>
          <P>
            Le Client reste propriétaire de l&apos;ensemble des données qu&apos;il importe sur la
            plateforme (catalogue produits, conversations, données clients). En cas de résiliation,
            le Client dispose d&apos;un délai de 30 jours pour exporter ses données via les outils
            prévus à cet effet. Passé ce délai, les données seront supprimées conformément à notre
            politique de confidentialité.
          </P>

          <SectionTitle>12. Droit de rétractation</SectionTitle>
          <P>
            Conformément à l&apos;article L221-28 du Code de la consommation, le droit de
            rétractation ne s&apos;applique pas à la fourniture de contenu numérique non fourni sur
            support matériel dont l&apos;exécution a commencé avec l&apos;accord préalable exprès du
            Client et son renoncement exprès à son droit de rétractation.
          </P>

          <SectionTitle>13. Modification des CGV</SectionTitle>
          <P>
            Bedones se réserve le droit de modifier les présentes CGV à tout moment. Les
            modifications seront notifiées au Client par email au moins 30 jours avant leur entrée
            en vigueur. La poursuite de l&apos;utilisation du service après cette date vaut
            acceptation des nouvelles conditions.
          </P>

          <SectionTitle>14. Droit applicable et litiges</SectionTitle>
          <P>
            Les présentes CGV sont régies par le droit ivoirien. En cas de litige relatif à
            l&apos;interprétation ou l&apos;exécution des présentes, les parties s&apos;engagent à
            rechercher une solution amiable dans un délai de 30 jours. À défaut d&apos;accord
            amiable, les tribunaux d&apos;Abidjan seront seuls compétents.
          </P>
        </div>
      </div>
    </div>
  )
}
