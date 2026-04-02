import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyPolicyPage,
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

function PrivacyPolicyPage() {
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
            Politique de confidentialité
          </Title>
          <Text type="secondary">Dernière mise à jour : 1er avril 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Responsable du traitement</SectionTitle>
          <P>
            Le responsable du traitement des données personnelles est Bedones SAS, dont le siège
            social est situé à Abidjan, Cocody Riviera Palmeraie, Côte d&apos;Ivoire. Pour toute
            question relative à la protection de vos données, contactez-nous à : privacy@bedones.com
          </P>

          <SectionTitle>2. Données collectées</SectionTitle>
          <P>
            Dans le cadre de la fourniture de nos services, nous collectons les catégories de
            données suivantes :
          </P>
          <P>
            <strong>Données d&apos;identification :</strong> nom, prénom, adresse email
            professionnelle, numéro de téléphone, nom de l&apos;entreprise, fonction au sein de
            l&apos;organisation.
          </P>
          <P>
            <strong>Données de connexion aux réseaux sociaux :</strong> tokens d&apos;accès OAuth
            des comptes Facebook, Instagram, TikTok, WhatsApp Business et Messenger que vous
            connectez à la plateforme. Nous n&apos;accédons jamais à vos mots de passe —
            l&apos;authentification passe exclusivement par les protocoles OAuth 2.0 des plateformes
            tierces.
          </P>
          <P>
            <strong>Données d&apos;interaction :</strong> messages reçus et envoyés via vos comptes
            sociaux connectés, commentaires, informations de commandes, données de tickets. Ces
            données transitent par nos systèmes pour permettre le fonctionnement des agents IA.
          </P>
          <P>
            <strong>Données d&apos;utilisation :</strong> logs de connexion, fonctionnalités
            utilisées, volume de messages traités, performances des agents configurés.
          </P>

          <SectionTitle>3. Finalités du traitement</SectionTitle>
          <P>
            Vos données sont traitées pour les finalités suivantes :<br />
            — Fourniture et fonctionnement de la plateforme Bedones et de ses agents IA
            <br />
            — Centralisation des messages et commentaires provenant de vos réseaux sociaux
            <br />
            — Traitement automatisé des interactions clients par les agents intelligents
            <br />
            — Gestion des commandes et des tickets de suivi
            <br />
            — Amélioration continue de la qualité des réponses automatiques
            <br />
            — Support client et assistance technique
            <br />— Facturation et gestion de votre abonnement
          </P>

          <SectionTitle>4. Base légale du traitement</SectionTitle>
          <P>
            Le traitement de vos données repose sur :<br />—{' '}
            <strong>L&apos;exécution du contrat</strong> : le traitement est nécessaire à la
            fourniture des services auxquels vous avez souscrit (gestion des messages, agent IA,
            tickets).
            <br />— <strong>Votre consentement</strong> : pour la connexion de vos comptes de
            réseaux sociaux et l&apos;activation des agents IA sur vos canaux de communication.
            <br />— <strong>L&apos;intérêt légitime</strong> : pour l&apos;amélioration de nos
            services, l&apos;analyse des performances et la prévention des abus.
          </P>

          <SectionTitle>5. Traitement par intelligence artificielle</SectionTitle>
          <P>
            Les agents Bedones utilisent des modèles de traitement du langage naturel pour analyser
            les messages entrants et générer des réponses appropriées. Les données de vos
            conversations sont traitées en temps réel par ces modèles pour :<br />
            — Comprendre l&apos;intention des messages de vos clients
            <br />
            — Générer des réponses contextuelles selon les règles que vous définissez
            <br />
            — Identifier et traiter les commandes de produits
            <br />— Modérer les commentaires selon vos critères
          </P>
          <P>
            Vous conservez le contrôle total sur le périmètre d&apos;action de vos agents. Aucune
            décision automatisée n&apos;est prise sans votre configuration préalable. Vous pouvez à
            tout moment désactiver le traitement automatique et reprendre la gestion manuelle de vos
            interactions.
          </P>

          <SectionTitle>6. Partage des données</SectionTitle>
          <P>
            Vos données peuvent être partagées avec :<br />—{' '}
            <strong>Les plateformes de réseaux sociaux</strong> (Meta, TikTok) dans le cadre strict
            du fonctionnement des API nécessaires au service.
            <br />— <strong>Nos sous-traitants techniques</strong> : hébergeur (AWS), fournisseurs
            d&apos;IA, services de paiement — tous liés par des contrats de sous-traitance conformes
            au RGPD.
            <br />— <strong>Les autorités compétentes</strong> si la loi l&apos;exige.
          </P>
          <P>
            Nous ne vendons jamais vos données personnelles à des tiers. Vos données de conversation
            ne sont pas utilisées pour entraîner des modèles d&apos;IA tiers sans votre consentement
            explicite.
          </P>

          <SectionTitle>7. Transfert de données hors UE</SectionTitle>
          <P>
            Certaines données peuvent être transférées vers des pays situés hors de l&apos;Union
            européenne dans le cadre de l&apos;utilisation des API Meta et TikTok. Ces transferts
            sont encadrés par les Clauses Contractuelles Types (CCT) adoptées par la Commission
            européenne et, le cas échéant, par le Data Privacy Framework UE-États-Unis.
          </P>

          <SectionTitle>8. Durée de conservation</SectionTitle>
          <P>
            — <strong>Données de compte :</strong> conservées pendant toute la durée de votre
            abonnement actif, puis 3 ans après la clôture du compte.
            <br />— <strong>Données de conversation :</strong> conservées pendant 12 mois glissants.
            Les conversations de plus de 12 mois sont automatiquement anonymisées.
            <br />— <strong>Données de facturation :</strong> conservées 10 ans conformément aux
            obligations comptables.
            <br />— <strong>Logs techniques :</strong> conservés 6 mois.
          </P>

          <SectionTitle>9. Vos droits</SectionTitle>
          <P>
            Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi
            Informatique et Libertés, vous disposez des droits suivants :
          </P>
          <P>
            — <strong>Droit d&apos;accès :</strong> obtenir une copie de l&apos;ensemble des données
            personnelles que nous détenons vous concernant.
            <br />— <strong>Droit de rectification :</strong> corriger vos données inexactes ou
            incomplètes.
            <br />— <strong>Droit à l&apos;effacement :</strong> demander la suppression de vos
            données dans les conditions prévues par la loi.
            <br />— <strong>Droit à la portabilité :</strong> recevoir vos données dans un format
            structuré, couramment utilisé et lisible par machine.
            <br />— <strong>Droit d&apos;opposition :</strong> vous opposer au traitement de vos
            données pour motif légitime.
            <br />— <strong>Droit à la limitation :</strong> demander la suspension du traitement
            dans certains cas.
          </P>
          <P>
            Pour exercer ces droits, adressez votre demande à privacy@bedones.com. Nous nous
            engageons à répondre dans un délai de 30 jours.
          </P>

          <SectionTitle>10. Cookies</SectionTitle>
          <P>
            Bedones utilise uniquement des cookies strictement nécessaires au fonctionnement de la
            plateforme (authentification, préférences de session). Aucun cookie publicitaire, de
            tracking ou d&apos;analyse comportementale n&apos;est déposé. Aucun consentement
            préalable n&apos;est donc requis pour ces cookies techniques.
          </P>

          <SectionTitle>11. Sécurité</SectionTitle>
          <P>
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour
            protéger vos données : chiffrement TLS en transit, chiffrement AES-256 au repos,
            authentification multi-facteurs, audits de sécurité réguliers, contrôle d&apos;accès
            basé sur les rôles, et surveillance continue des accès aux données.
          </P>

          <SectionTitle>12. Réclamation</SectionTitle>
          <P>
            Si vous estimez que le traitement de vos données n&apos;est pas conforme à la
            réglementation, vous pouvez introduire une réclamation auprès de la CNIL (Commission
            Nationale de l&apos;Informatique et des Libertés) ou de l&apos;autorité de protection
            des données de votre pays de résidence.
          </P>
        </div>
      </div>
    </div>
  )
}
