import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/mentions')({
  component: MentionsLegalesPage,
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

function MentionsLegalesPage() {
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
            Mentions légales
          </Title>
          <Text type="secondary">Dernière mise à jour : 1er avril 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Éditeur de la plateforme</SectionTitle>
          <P>
            La plateforme Bedones est éditée par Bedones SAS, société par actions simplifiée au
            capital de 10 000 euros, immatriculée au Registre du Commerce et des Sociétés
            d&apos;Abidjan sous le numéro RCS CI-ABJ-2025-B-12345.
          </P>
          <P>
            Siège social : Abidjan, Cocody Riviera Palmeraie, Côte d&apos;Ivoire
            <br />
            Numéro de TVA intracommunautaire : CI 1234567890
            <br />
            Directeur de la publication : Le représentant légal de Bedones SAS
          </P>

          <SectionTitle>2. Nature du service</SectionTitle>
          <P>
            Bedones est une plateforme SaaS (Software as a Service) qui permet aux entreprises de
            connecter leurs comptes de réseaux sociaux (WhatsApp Business, Instagram, Facebook,
            TikTok, Messenger) à des agents intelligents alimentés par l&apos;intelligence
            artificielle. Ces agents gèrent automatiquement les interactions clients : réponses aux
            messages, modération des commentaires, prise de commandes et suivi des tickets.
          </P>

          <SectionTitle>3. Hébergement</SectionTitle>
          <P>
            La plateforme est hébergée par Amazon Web Services (AWS), dont le siège européen est
            situé au 38 avenue John F. Kennedy, L-1855 Luxembourg. Les données sont principalement
            stockées dans la région eu-west-1 (Irlande), conformément aux exigences du RGPD.
          </P>

          <SectionTitle>4. Propriété intellectuelle</SectionTitle>
          <P>
            L&apos;ensemble des éléments composant la plateforme Bedones — incluant mais non limité
            à l&apos;interface utilisateur, les algorithmes d&apos;intelligence artificielle, les
            modèles de traitement du langage naturel, les bases de données, le code source, les
            textes, graphiques, logos et marques — sont la propriété exclusive de Bedones SAS ou de
            ses partenaires licenseurs.
          </P>
          <P>
            Toute reproduction, représentation, modification, publication, adaptation ou
            exploitation de tout ou partie de ces éléments, quel que soit le moyen ou le procédé
            utilisé, est interdite sans l&apos;autorisation écrite préalable de Bedones SAS. Toute
            exploitation non autorisée constitue une contrefaçon sanctionnée par les articles
            L.335-2 et suivants du Code de la Propriété Intellectuelle.
          </P>

          <SectionTitle>5. Données relatives aux réseaux sociaux tiers</SectionTitle>
          <P>
            Bedones accède aux comptes de réseaux sociaux des utilisateurs via les API officielles
            fournies par Meta Platforms Inc. (Facebook, Instagram, Messenger, WhatsApp Business API)
            et TikTok Ltd. L&apos;utilisation de ces API est soumise aux conditions
            d&apos;utilisation respectives de ces plateformes. Bedones ne saurait être tenu
            responsable des modifications, interruptions ou restrictions d&apos;accès décidées
            unilatéralement par ces fournisseurs tiers.
          </P>

          <SectionTitle>6. Limitation de responsabilité</SectionTitle>
          <P>
            Les réponses générées par les agents IA de Bedones sont produites de manière automatisée
            à partir des données et instructions configurées par l&apos;utilisateur. Bedones ne
            garantit pas l&apos;exactitude, l&apos;exhaustivité ou la pertinence des réponses
            automatiques et ne saurait être tenu responsable des conséquences découlant de ces
            interactions automatisées avec les clients finaux.
          </P>

          <SectionTitle>7. Contact</SectionTitle>
          <P>
            Pour toute question relative aux présentes mentions légales, vous pouvez nous contacter
            à l&apos;adresse : legal@bedones.com
          </P>
        </div>
      </div>
    </div>
  )
}
