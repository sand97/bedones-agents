import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/fr/conditions')({
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
            Conditions g&eacute;n&eacute;rales de vente
          </Title>
          <Text type="secondary">Derni&egrave;re mise &agrave; jour : 1er avril 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Objet</SectionTitle>
          <P>
            Les pr&eacute;sentes Conditions G&eacute;n&eacute;rales de Vente (CGV) r&eacute;gissent
            l&apos;ensemble des relations contractuelles entre Bedones SAS (ci-apr&egrave;s &laquo;
            Bedones &raquo;) et toute personne physique ou morale souscrivant &agrave; un abonnement
            &agrave; la plateforme Bedones (ci-apr&egrave;s &laquo; le Client &raquo;).
          </P>

          <SectionTitle>2. Description des services</SectionTitle>
          <P>
            Bedones fournit une plateforme SaaS de gestion intelligente des interactions sociales
            pour les entreprises. Les services incluent :
          </P>
          <P>
            — <strong>Connexion multi-canaux :</strong> int&eacute;gration de vos comptes WhatsApp
            Business, Instagram, Facebook, TikTok et Messenger dans une interface unifi&eacute;e.
            <br />— <strong>Agents IA conversationnels :</strong> configuration d&apos;agents
            intelligents capables de r&eacute;pondre automatiquement aux messages et commentaires de
            vos clients, selon les r&egrave;gles et le ton que vous d&eacute;finissez.
            <br />— <strong>Gestion des commandes :</strong> prise de commandes automatis&eacute;e
            via les conversations, avec cr&eacute;ation et suivi de tickets.
            <br />— <strong>Mod&eacute;ration des commentaires :</strong> surveillance et
            mod&eacute;ration automatique des commentaires sur vos publications Facebook, Instagram
            et TikTok.
            <br />— <strong>Catalogue produits :</strong> gestion centralis&eacute;e de votre
            catalogue, accessible par les agents pour pr&eacute;senter vos produits aux clients.
            <br />— <strong>Tableau de bord et statistiques :</strong> suivi des performances de vos
            agents, volume d&apos;interactions, taux de conversion et satisfaction client.
          </P>

          <SectionTitle>3. Souscription et acc&egrave;s</SectionTitle>
          <P>
            L&apos;acc&egrave;s &agrave; la plateforme n&eacute;cessite la cr&eacute;ation d&apos;un
            compte et la souscription &agrave; l&apos;un des plans tarifaires propos&eacute;s. Le
            Client s&apos;engage &agrave; fournir des informations exactes lors de son inscription
            et &agrave; maintenir la confidentialit&eacute; de ses identifiants de connexion.
          </P>
          <P>
            L&apos;abonnement prend effet d&egrave;s la validation du paiement. Le Client peut
            inviter des membres de son organisation &agrave; acc&eacute;der &agrave; la plateforme
            selon les limites de son plan.
          </P>

          <SectionTitle>4. Tarification</SectionTitle>
          <P>
            Les tarifs des diff&eacute;rents plans sont affich&eacute;s sur la page Tarifs de la
            plateforme et peuvent &ecirc;tre modifi&eacute;s &agrave; tout moment. Toute
            modification tarifaire sera notifi&eacute;e au Client au moins 30 jours avant son
            entr&eacute;e en vigueur et ne s&apos;appliquera qu&apos;au prochain renouvellement de
            l&apos;abonnement.
          </P>
          <P>
            Les prix sont indiqu&eacute;s en francs CFA (XOF) ou en euros (EUR) selon la
            localisation du Client, hors taxes applicables. Le Client est responsable du paiement
            des taxes en vigueur dans son pays.
          </P>

          <SectionTitle>5. Modalit&eacute;s de paiement</SectionTitle>
          <P>
            Le paiement s&apos;effectue par carte bancaire, virement ou mobile money selon les
            moyens disponibles dans votre r&eacute;gion. La facturation est r&eacute;currente,
            mensuelle ou annuelle selon le plan choisi. Le paiement est exigible &agrave; chaque
            date de renouvellement.
          </P>
          <P>
            En cas de non-paiement dans les 7 jours suivant la date d&apos;&eacute;ch&eacute;ance,
            Bedones se r&eacute;serve le droit de suspendre l&apos;acc&egrave;s au service. Les
            agents IA seront d&eacute;sactiv&eacute;s et les messages entrants ne seront plus
            trait&eacute;s automatiquement. L&apos;acc&egrave;s sera r&eacute;tabli dans les 24
            heures suivant la r&eacute;gularisation du paiement.
          </P>

          <SectionTitle>6. Engagement et dur&eacute;e</SectionTitle>
          <P>
            Les abonnements mensuels sont sans engagement de dur&eacute;e. Les abonnements annuels
            sont souscrits pour une dur&eacute;e de 12 mois et sont renouvel&eacute;s tacitement
            &agrave; chaque date anniversaire, sauf r&eacute;siliation dans les conditions
            pr&eacute;vues &agrave; l&apos;article 7.
          </P>

          <SectionTitle>7. R&eacute;siliation</SectionTitle>
          <P>
            <strong>Abonnement mensuel :</strong> le Client peut r&eacute;silier &agrave; tout
            moment depuis les param&egrave;tres de son compte. La r&eacute;siliation prend effet
            &agrave; la fin de la p&eacute;riode mensuelle en cours. Le service reste accessible
            jusqu&apos;à cette date.
          </P>
          <P>
            <strong>Abonnement annuel :</strong> le Client peut demander la r&eacute;siliation au
            moins 30 jours avant la date de renouvellement. Aucun remboursement prorata temporis ne
            sera effectu&eacute; pour la p&eacute;riode restante.
          </P>
          <P>
            <strong>R&eacute;siliation par Bedones :</strong> Bedones se r&eacute;serve le droit de
            r&eacute;silier l&apos;abonnement d&apos;un Client en cas de violation des
            pr&eacute;sentes CGV, d&apos;utilisation abusive du service, ou d&apos;activit&eacute;s
            contraires aux conditions d&apos;utilisation des plateformes tierces (Meta, TikTok). Le
            Client sera notifi&eacute; par email 15 jours avant la r&eacute;siliation effective,
            sauf en cas de manquement grave.
          </P>

          <SectionTitle>8. Niveau de service (SLA)</SectionTitle>
          <P>
            Bedones s&apos;engage &agrave; maintenir une disponibilit&eacute; de la plateforme de
            99,5 % par mois calendaire, hors maintenances programm&eacute;es et interruptions des
            API tierces (Meta, TikTok, WhatsApp). Les maintenances programm&eacute;es seront
            communiqu&eacute;es au moins 48 heures &agrave; l&apos;avance.
          </P>

          <SectionTitle>9. Responsabilit&eacute;</SectionTitle>
          <P>
            Bedones s&apos;engage &agrave; fournir ses services avec diligence et
            conform&eacute;ment aux r&egrave;gles de l&apos;art. Toutefois, Bedones ne saurait
            &ecirc;tre tenu responsable :
          </P>
          <P>
            — Des interruptions de service imputables aux fournisseurs tiers (Meta, TikTok,
            WhatsApp, AWS) ou aux op&eacute;rateurs de t&eacute;l&eacute;communications.
            <br />
            — Des r&eacute;ponses g&eacute;n&eacute;r&eacute;es par les agents IA, dont le contenu
            d&eacute;pend de la configuration d&eacute;finie par le Client et des donn&eacute;es
            disponibles.
            <br />
            — Des pertes de chiffre d&apos;affaires ou de client&egrave;le r&eacute;sultant
            d&apos;interactions automatis&eacute;es mal configur&eacute;es par le Client.
            <br />— De la conformit&eacute; des messages automatiques avec la r&eacute;glementation
            applicable dans le pays du Client (publicit&eacute;, protection du consommateur).
          </P>
          <P>
            En tout &eacute;tat de cause, la responsabilit&eacute; totale de Bedones ne pourra
            exc&eacute;der le montant des sommes vers&eacute;es par le Client au cours des 12
            derniers mois pr&eacute;c&eacute;dant l&apos;&eacute;v&eacute;nement
            g&eacute;n&eacute;rateur de responsabilit&eacute;.
          </P>

          <SectionTitle>10. Obligations du Client</SectionTitle>
          <P>
            Le Client s&apos;engage &agrave; :<br />
            — Utiliser la plateforme conform&eacute;ment aux pr&eacute;sentes CGV et &agrave; la
            r&eacute;glementation applicable.
            <br />
            — Configurer ses agents IA de mani&egrave;re responsable et s&apos;assurer que les
            r&eacute;ponses automatiques respectent la l&eacute;gislation en vigueur.
            <br />
            — Ne pas utiliser le service pour envoyer du spam, du contenu illicite ou des
            communications commerciales non sollicit&eacute;es.
            <br />
            — Respecter les conditions d&apos;utilisation des plateformes tierces sur lesquelles ses
            comptes sont connect&eacute;s.
            <br />— Maintenir &agrave; jour les informations de son compte et ses moyens de
            paiement.
          </P>

          <SectionTitle>11. Propri&eacute;t&eacute; des donn&eacute;es</SectionTitle>
          <P>
            Le Client reste propri&eacute;taire de l&apos;ensemble des donn&eacute;es qu&apos;il
            importe sur la plateforme (catalogue produits, conversations, donn&eacute;es clients).
            En cas de r&eacute;siliation, le Client dispose d&apos;un d&eacute;lai de 30 jours pour
            exporter ses donn&eacute;es via les outils pr&eacute;vus &agrave; cet effet.
            Pass&eacute; ce d&eacute;lai, les donn&eacute;es seront supprim&eacute;es
            conform&eacute;ment &agrave; notre politique de confidentialit&eacute;.
          </P>

          <SectionTitle>12. Droit de r&eacute;tractation</SectionTitle>
          <P>
            Conform&eacute;ment &agrave; l&apos;article L221-28 du Code de la consommation, le droit
            de r&eacute;tractation ne s&apos;applique pas &agrave; la fourniture de contenu
            num&eacute;rique non fourni sur support mat&eacute;riel dont l&apos;ex&eacute;cution a
            commenc&eacute; avec l&apos;accord pr&eacute;alable expr&egrave;s du Client et son
            renoncement expr&egrave;s &agrave; son droit de r&eacute;tractation.
          </P>

          <SectionTitle>13. Modification des CGV</SectionTitle>
          <P>
            Bedones se r&eacute;serve le droit de modifier les pr&eacute;sentes CGV &agrave; tout
            moment. Les modifications seront notifi&eacute;es au Client par email au moins 30 jours
            avant leur entr&eacute;e en vigueur. La poursuite de l&apos;utilisation du service
            apr&egrave;s cette date vaut acceptation des nouvelles conditions.
          </P>

          <SectionTitle>14. Droit applicable et litiges</SectionTitle>
          <P>
            Les pr&eacute;sentes CGV sont r&eacute;gies par le droit ivoirien. En cas de litige
            relatif &agrave; l&apos;interpr&eacute;tation ou l&apos;ex&eacute;cution des
            pr&eacute;sentes, les parties s&apos;engagent &agrave; rechercher une solution amiable
            dans un d&eacute;lai de 30 jours. &Agrave; d&eacute;faut d&apos;accord amiable, les
            tribunaux d&apos;Abidjan seront seuls comp&eacute;tents.
          </P>
        </div>
      </div>
    </div>
  )
}
