import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/fr/privacy')({
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
            Politique de confidentialit&eacute;
          </Title>
          <Text type="secondary">Derni&egrave;re mise &agrave; jour : 1er avril 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Responsable du traitement</SectionTitle>
          <P>
            Le responsable du traitement des donn&eacute;es personnelles est Bedones SAS, dont le
            si&egrave;ge social est situ&eacute; &agrave; Abidjan, Cocody Riviera Palmeraie,
            C&ocirc;te d&apos;Ivoire. Pour toute question relative &agrave; la protection de vos
            donn&eacute;es, contactez-nous &agrave; : privacy@bedones.com
          </P>

          <SectionTitle>2. Donn&eacute;es collect&eacute;es</SectionTitle>
          <P>
            Dans le cadre de la fourniture de nos services, nous collectons les cat&eacute;gories de
            donn&eacute;es suivantes :
          </P>
          <P>
            <strong>Donn&eacute;es d&apos;identification :</strong> nom, pr&eacute;nom, adresse
            email professionnelle, num&eacute;ro de t&eacute;l&eacute;phone, nom de
            l&apos;entreprise, fonction au sein de l&apos;organisation.
          </P>
          <P>
            <strong>Donn&eacute;es de connexion aux r&eacute;seaux sociaux :</strong> tokens
            d&apos;acc&egrave;s OAuth des comptes Facebook, Instagram, TikTok, WhatsApp Business et
            Messenger que vous connectez &agrave; la plateforme. Nous n&apos;acc&eacute;dons jamais
            &agrave; vos mots de passe — l&apos;authentification passe exclusivement par les
            protocoles OAuth 2.0 des plateformes tierces.
          </P>
          <P>
            <strong>Donn&eacute;es d&apos;interaction :</strong> messages re&ccedil;us et
            envoy&eacute;s via vos comptes sociaux connect&eacute;s, commentaires, informations de
            commandes, donn&eacute;es de tickets. Ces donn&eacute;es transitent par nos
            syst&egrave;mes pour permettre le fonctionnement des agents IA.
          </P>
          <P>
            <strong>Donn&eacute;es d&apos;utilisation :</strong> logs de connexion,
            fonctionnalit&eacute;s utilis&eacute;es, volume de messages trait&eacute;s, performances
            des agents configur&eacute;s.
          </P>

          <SectionTitle>3. Finalit&eacute;s du traitement</SectionTitle>
          <P>
            Vos donn&eacute;es sont trait&eacute;es pour les finalit&eacute;s suivantes :
            <br />
            — Fourniture et fonctionnement de la plateforme Bedones et de ses agents IA
            <br />
            — Centralisation des messages et commentaires provenant de vos r&eacute;seaux sociaux
            <br />
            — Traitement automatis&eacute; des interactions clients par les agents intelligents
            <br />
            — Gestion des commandes et des tickets de suivi
            <br />
            — Am&eacute;lioration continue de la qualit&eacute; des r&eacute;ponses automatiques
            <br />
            — Support client et assistance technique
            <br />— Facturation et gestion de votre abonnement
          </P>

          <SectionTitle>4. Base l&eacute;gale du traitement</SectionTitle>
          <P>
            Le traitement de vos donn&eacute;es repose sur :<br />—{' '}
            <strong>L&apos;ex&eacute;cution du contrat</strong> : le traitement est
            n&eacute;cessaire &agrave; la fourniture des services auxquels vous avez souscrit
            (gestion des messages, agent IA, tickets).
            <br />— <strong>Votre consentement</strong> : pour la connexion de vos comptes de
            r&eacute;seaux sociaux et l&apos;activation des agents IA sur vos canaux de
            communication.
            <br />— <strong>L&apos;int&eacute;r&ecirc;t l&eacute;gitime</strong> : pour
            l&apos;am&eacute;lioration de nos services, l&apos;analyse des performances et la
            pr&eacute;vention des abus.
          </P>

          <SectionTitle>5. Traitement par intelligence artificielle</SectionTitle>
          <P>
            Les agents Bedones utilisent des mod&egrave;les de traitement du langage naturel pour
            analyser les messages entrants et g&eacute;n&eacute;rer des r&eacute;ponses
            appropri&eacute;es. Les donn&eacute;es de vos conversations sont trait&eacute;es en
            temps r&eacute;el par ces mod&egrave;les pour :<br />
            — Comprendre l&apos;intention des messages de vos clients
            <br />
            — G&eacute;n&eacute;rer des r&eacute;ponses contextuelles selon les r&egrave;gles que
            vous d&eacute;finissez
            <br />
            — Identifier et traiter les commandes de produits
            <br />— Mod&eacute;rer les commentaires selon vos crit&egrave;res
          </P>
          <P>
            Vous conservez le contr&ocirc;le total sur le p&eacute;rim&egrave;tre d&apos;action de
            vos agents. Aucune d&eacute;cision automatis&eacute;e n&apos;est prise sans votre
            configuration pr&eacute;alable. Vous pouvez &agrave; tout moment d&eacute;sactiver le
            traitement automatique et reprendre la gestion manuelle de vos interactions.
          </P>

          <SectionTitle>6. Partage des donn&eacute;es</SectionTitle>
          <P>
            Vos donn&eacute;es peuvent &ecirc;tre partag&eacute;es avec :<br />—{' '}
            <strong>Les plateformes de r&eacute;seaux sociaux</strong> (Meta, TikTok) dans le cadre
            strict du fonctionnement des API n&eacute;cessaires au service.
            <br />— <strong>Nos sous-traitants techniques</strong> : h&eacute;bergeur (AWS),
            fournisseurs d&apos;IA, services de paiement — tous li&eacute;s par des contrats de
            sous-traitance conformes au RGPD.
            <br />— <strong>Les autorit&eacute;s comp&eacute;tentes</strong> si la loi l&apos;exige.
          </P>
          <P>
            Nous ne vendons jamais vos donn&eacute;es personnelles &agrave; des tiers. Vos
            donn&eacute;es de conversation ne sont pas utilis&eacute;es pour entra&icirc;ner des
            mod&egrave;les d&apos;IA tiers sans votre consentement explicite.
          </P>

          <SectionTitle>7. Transfert de donn&eacute;es hors UE</SectionTitle>
          <P>
            Certaines donn&eacute;es peuvent &ecirc;tre transf&eacute;r&eacute;es vers des pays
            situ&eacute;s hors de l&apos;Union europ&eacute;enne dans le cadre de l&apos;utilisation
            des API Meta et TikTok. Ces transferts sont encadr&eacute;s par les Clauses
            Contractuelles Types (CCT) adopt&eacute;es par la Commission europ&eacute;enne et, le
            cas &eacute;ch&eacute;ant, par le Data Privacy Framework UE-&Eacute;tats-Unis.
          </P>

          <SectionTitle>8. Dur&eacute;e de conservation</SectionTitle>
          <P>
            — <strong>Donn&eacute;es de compte :</strong> conserv&eacute;es pendant toute la
            dur&eacute;e de votre abonnement actif, puis 3 ans apr&egrave;s la cl&ocirc;ture du
            compte.
            <br />— <strong>Donn&eacute;es de conversation :</strong> conserv&eacute;es pendant 12
            mois glissants. Les conversations de plus de 12 mois sont automatiquement
            anonymis&eacute;es.
            <br />— <strong>Donn&eacute;es de facturation :</strong> conserv&eacute;es 10 ans
            conform&eacute;ment aux obligations comptables.
            <br />— <strong>Logs techniques :</strong> conserv&eacute;s 6 mois.
          </P>

          <SectionTitle>9. Vos droits</SectionTitle>
          <P>
            Conform&eacute;ment au R&egrave;glement G&eacute;n&eacute;ral sur la Protection des
            Donn&eacute;es (RGPD) et &agrave; la loi Informatique et Libert&eacute;s, vous disposez
            des droits suivants :
          </P>
          <P>
            — <strong>Droit d&apos;acc&egrave;s :</strong> obtenir une copie de l&apos;ensemble des
            donn&eacute;es personnelles que nous d&eacute;tenons vous concernant.
            <br />— <strong>Droit de rectification :</strong> corriger vos donn&eacute;es inexactes
            ou incompl&egrave;tes.
            <br />— <strong>Droit &agrave; l&apos;effacement :</strong> demander la suppression de
            vos donn&eacute;es dans les conditions pr&eacute;vues par la loi.
            <br />— <strong>Droit &agrave; la portabilit&eacute; :</strong> recevoir vos
            donn&eacute;es dans un format structur&eacute;, couramment utilis&eacute; et lisible par
            machine.
            <br />— <strong>Droit d&apos;opposition :</strong> vous opposer au traitement de vos
            donn&eacute;es pour motif l&eacute;gitime.
            <br />— <strong>Droit &agrave; la limitation :</strong> demander la suspension du
            traitement dans certains cas.
          </P>
          <P>
            Pour exercer ces droits, adressez votre demande &agrave; privacy@bedones.com. Nous nous
            engageons &agrave; r&eacute;pondre dans un d&eacute;lai de 30 jours.
          </P>

          <SectionTitle>10. Cookies</SectionTitle>
          <P>
            Bedones utilise des cookies techniques strictement n&eacute;cessaires au fonctionnement
            de la plateforme (authentification, session, pr&eacute;f&eacute;rences). En
            compl&eacute;ment, des cookies optionnels peuvent &ecirc;tre utilis&eacute;s pour
            am&eacute;liorer votre exp&eacute;rience.
          </P>
          <P>
            Lors de votre premi&egrave;re visite, une fen&ecirc;tre de consentement vous permet de
            choisir d&apos;accepter tous les cookies ou uniquement les cookies essentiels. Votre
            choix est enregistr&eacute; dans un cookie <code>cookie_consent</code> valable un an.
            Vous pouvez modifier votre pr&eacute;f&eacute;rence &agrave; tout moment en supprimant
            ce cookie de votre navigateur.
          </P>

          <SectionTitle>11. S&eacute;curit&eacute;</SectionTitle>
          <P>
            Nous mettons en oeuvre des mesures techniques et organisationnelles appropri&eacute;es
            pour prot&eacute;ger vos donn&eacute;es : chiffrement TLS en transit, chiffrement
            AES-256 au repos, authentification multi-facteurs, audits de s&eacute;curit&eacute;
            r&eacute;guliers, contr&ocirc;le d&apos;acc&egrave;s bas&eacute; sur les r&ocirc;les, et
            surveillance continue des acc&egrave;s aux donn&eacute;es.
          </P>

          <SectionTitle>12. R&eacute;clamation</SectionTitle>
          <P>
            Si vous estimez que le traitement de vos donn&eacute;es n&apos;est pas conforme &agrave;
            la r&eacute;glementation, vous pouvez introduire une r&eacute;clamation aupr&egrave;s de
            la CNIL (Commission Nationale de l&apos;Informatique et des Libert&eacute;s) ou de
            l&apos;autorit&eacute; de protection des donn&eacute;es de votre pays de
            r&eacute;sidence.
          </P>
        </div>
      </div>
    </div>
  )
}
