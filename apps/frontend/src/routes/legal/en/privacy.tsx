import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/en/privacy')({
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
          <span>Back</span>
        </a>

        <div className="legal-public__header">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
              <span className="text-sm font-bold text-white">B</span>
            </div>
            <span className="text-lg font-semibold">Bedones</span>
          </div>
          <Title level={2} style={{ margin: 0, marginTop: 16 }}>
            Privacy Policy
          </Title>
          <Text type="secondary">Last updated: April 1, 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Data Controller</SectionTitle>
          <P>
            The data controller for personal data processing is Bedones SAS, with its registered
            office located in Abidjan, Cocody Riviera Palmeraie, C&ocirc;te d&apos;Ivoire. For any
            questions regarding the protection of your data, please contact us at:
            privacy@bedones.com
          </P>

          <SectionTitle>2. Data Collected</SectionTitle>
          <P>
            In connection with providing our services, we collect the following categories of data:
          </P>
          <P>
            <strong>Identification data:</strong> last name, first name, professional email address,
            phone number, company name, role within the organization.
          </P>
          <P>
            <strong>Social media connection data:</strong> OAuth access tokens for the Facebook,
            Instagram, TikTok, WhatsApp Business, and Messenger accounts you connect to the
            platform. We never access your passwords — authentication is handled exclusively through
            the third-party platforms&apos; OAuth 2.0 protocols.
          </P>
          <P>
            <strong>Interaction data:</strong> messages received and sent through your connected
            social accounts, comments, order information, and ticket data. This data passes through
            our systems to enable the AI agents to function.
          </P>
          <P>
            <strong>Usage data:</strong> connection logs, features used, volume of messages
            processed, and performance metrics of configured agents.
          </P>

          <SectionTitle>3. Purposes of Processing</SectionTitle>
          <P>
            Your data is processed for the following purposes:
            <br />
            — Provision and operation of the Bedones platform and its AI agents
            <br />
            — Centralization of messages and comments from your social media channels
            <br />
            — Automated processing of customer interactions by intelligent agents
            <br />
            — Order management and support ticket tracking
            <br />
            — Continuous improvement of automated response quality
            <br />
            — Customer support and technical assistance
            <br />— Billing and subscription management
          </P>

          <SectionTitle>4. Legal Basis for Processing</SectionTitle>
          <P>
            The processing of your data is based on:
            <br />— <strong>Performance of a contract</strong>: processing is necessary for the
            provision of the services you have subscribed to (message management, AI agents,
            tickets).
            <br />— <strong>Your consent</strong>: for connecting your social media accounts and
            activating AI agents on your communication channels.
            <br />— <strong>Legitimate interest</strong>: for improving our services, analyzing
            performance, and preventing abuse.
          </P>

          <SectionTitle>5. Artificial Intelligence Processing</SectionTitle>
          <P>
            Bedones agents use natural language processing models to analyze incoming messages and
            generate appropriate responses. Your conversation data is processed in real time by
            these models to:
            <br />
            — Understand the intent of your customers&apos; messages
            <br />
            — Generate contextual responses based on the rules you define
            <br />
            — Identify and process product orders
            <br />— Moderate comments according to your criteria
          </P>
          <P>
            You retain full control over the scope of your agents&apos; actions. No automated
            decisions are made without your prior configuration. You may disable automated
            processing at any time and resume manual management of your interactions.
          </P>

          <SectionTitle>6. Data Sharing</SectionTitle>
          <P>
            Your data may be shared with:
            <br />— <strong>Social media platforms</strong> (Meta, TikTok) strictly within the scope
            of API operations required for the service.
            <br />— <strong>Our technical subcontractors</strong>: hosting provider (AWS), AI
            providers, payment services — all bound by data processing agreements compliant with
            GDPR.
            <br />— <strong>Competent authorities</strong> where required by law.
          </P>
          <P>
            We never sell your personal data to third parties. Your conversation data is not used to
            train third-party AI models without your explicit consent.
          </P>

          <SectionTitle>7. Data Transfers Outside the EU</SectionTitle>
          <P>
            Certain data may be transferred to countries outside the European Union in connection
            with the use of Meta and TikTok APIs. These transfers are governed by the Standard
            Contractual Clauses (SCCs) adopted by the European Commission and, where applicable, the
            EU-U.S. Data Privacy Framework.
          </P>

          <SectionTitle>8. Data Retention</SectionTitle>
          <P>
            — <strong>Account data:</strong> retained for the duration of your active subscription,
            then for 3 years following account closure.
            <br />— <strong>Conversation data:</strong> retained on a rolling 12-month basis.
            Conversations older than 12 months are automatically anonymized.
            <br />— <strong>Billing data:</strong> retained for 10 years in accordance with
            statutory accounting obligations.
            <br />— <strong>Technical logs:</strong> retained for 6 months.
          </P>

          <SectionTitle>9. Your Rights</SectionTitle>
          <P>
            In accordance with the General Data Protection Regulation (GDPR) and applicable data
            protection laws, you have the following rights:
          </P>
          <P>
            — <strong>Right of access:</strong> obtain a copy of all personal data we hold about
            you.
            <br />— <strong>Right to rectification:</strong> correct any inaccurate or incomplete
            data.
            <br />— <strong>Right to erasure:</strong> request the deletion of your data under the
            conditions provided by law.
            <br />— <strong>Right to data portability:</strong> receive your data in a structured,
            commonly used, and machine-readable format.
            <br />— <strong>Right to object:</strong> object to the processing of your data on
            legitimate grounds.
            <br />— <strong>Right to restriction:</strong> request the suspension of processing in
            certain circumstances.
          </P>
          <P>
            To exercise these rights, please send your request to privacy@bedones.com. We are
            committed to responding within 30 days.
          </P>

          <SectionTitle>10. Cookies</SectionTitle>
          <P>
            Bedones uses cookies that are strictly necessary for the operation of the platform
            (authentication, session, preferences). Additionally, optional cookies may be used to
            improve your experience.
          </P>
          <P>
            On your first visit, a consent dialog allows you to choose between accepting all cookies
            or only essential cookies. Your choice is stored in a <code>cookie_consent</code> cookie
            valid for one year. You can change your preference at any time by deleting this cookie
            from your browser.
          </P>

          <SectionTitle>11. Security</SectionTitle>
          <P>
            We implement appropriate technical and organizational measures to protect your data: TLS
            encryption in transit, AES-256 encryption at rest, multi-factor authentication, regular
            security audits, role-based access control, and continuous monitoring of data access.
          </P>

          <SectionTitle>12. Complaints</SectionTitle>
          <P>
            If you believe that the processing of your data does not comply with applicable
            regulations, you may file a complaint with the CNIL (Commission Nationale de
            l&apos;Informatique et des Libert&eacute;s) or the data protection authority of your
            country of residence.
          </P>
        </div>
      </div>
    </div>
  )
}
