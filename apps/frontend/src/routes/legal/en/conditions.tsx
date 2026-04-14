import { createFileRoute } from '@tanstack/react-router'
import { Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'

const { Title, Text } = Typography

export const Route = createFileRoute('/legal/en/conditions')({
  component: TermsOfSalePage,
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

function TermsOfSalePage() {
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
            General Terms and Conditions of Sale
          </Title>
          <Text type="secondary">Last updated: April 1, 2026</Text>
        </div>

        <div className="legal-public__content">
          <SectionTitle>1. Purpose</SectionTitle>
          <P>
            These General Terms and Conditions of Sale (hereinafter &quot;Terms&quot;) govern all
            contractual relationships between Bedones SAS (hereinafter &quot;Bedones&quot;) and any
            individual or legal entity subscribing to the Bedones platform (hereinafter &quot;the
            Customer&quot;).
          </P>

          <SectionTitle>2. Description of Services</SectionTitle>
          <P>
            Bedones provides a SaaS platform for intelligent social media interaction management for
            businesses. The services include:
          </P>
          <P>
            — <strong>Multi-channel integration:</strong> connect your WhatsApp Business, Instagram,
            Facebook, TikTok, and Messenger accounts within a unified interface.
            <br />— <strong>Conversational AI agents:</strong> configure intelligent agents capable
            of automatically responding to your customers&apos; messages and comments, according to
            the rules and tone you define.
            <br />— <strong>Order management:</strong> automated order processing through
            conversations, with ticket creation and tracking.
            <br />— <strong>Comment moderation:</strong> automated monitoring and moderation of
            comments on your Facebook, Instagram, and TikTok posts.
            <br />— <strong>Product catalog:</strong> centralized management of your catalog,
            accessible by agents to showcase your products to customers.
            <br />— <strong>Dashboard and analytics:</strong> track agent performance, interaction
            volume, conversion rates, and customer satisfaction.
          </P>

          <SectionTitle>3. Subscription and Access</SectionTitle>
          <P>
            Access to the platform requires account creation and subscription to one of the
            available pricing plans. The Customer agrees to provide accurate information upon
            registration and to maintain the confidentiality of their login credentials.
          </P>
          <P>
            The subscription takes effect upon payment validation. The Customer may invite members
            of their organization to access the platform within the limits of their plan.
          </P>

          <SectionTitle>4. Pricing</SectionTitle>
          <P>
            Prices for the various plans are displayed on the platform&apos;s Pricing page and may
            be modified at any time. Any pricing changes will be notified to the Customer at least
            30 days before taking effect and will only apply upon the next subscription renewal.
          </P>
          <P>
            Prices are quoted in CFA francs (XOF) or euros (EUR) depending on the Customer&apos;s
            location, exclusive of applicable taxes. The Customer is responsible for the payment of
            taxes applicable in their country.
          </P>

          <SectionTitle>5. Payment Terms</SectionTitle>
          <P>
            Payment may be made by credit card, bank transfer, or mobile money, depending on the
            methods available in your region. Billing is recurring, either monthly or annually
            depending on the chosen plan. Payment is due on each renewal date.
          </P>
          <P>
            In the event of non-payment within 7 days of the due date, Bedones reserves the right to
            suspend access to the service. AI agents will be deactivated and incoming messages will
            no longer be processed automatically. Access will be restored within 24 hours of payment
            regularization.
          </P>

          <SectionTitle>6. Commitment and Duration</SectionTitle>
          <P>
            Monthly subscriptions have no minimum commitment period. Annual subscriptions are taken
            out for a period of 12 months and are automatically renewed on each anniversary date,
            unless terminated in accordance with the conditions set out in Section 7.
          </P>

          <SectionTitle>7. Termination</SectionTitle>
          <P>
            <strong>Monthly subscription:</strong> the Customer may cancel at any time from their
            account settings. Termination takes effect at the end of the current monthly period. The
            service remains accessible until that date.
          </P>
          <P>
            <strong>Annual subscription:</strong> the Customer may request termination at least 30
            days before the renewal date. No pro rata refund will be issued for the remaining
            period.
          </P>
          <P>
            <strong>Termination by Bedones:</strong> Bedones reserves the right to terminate a
            Customer&apos;s subscription in the event of a breach of these Terms, misuse of the
            service, or activities that violate the terms of use of third-party platforms (Meta,
            TikTok). The Customer will be notified by email 15 days before the effective
            termination, except in cases of serious breach.
          </P>

          <SectionTitle>8. Service Level Agreement (SLA)</SectionTitle>
          <P>
            Bedones commits to maintaining platform availability of 99.5% per calendar month,
            excluding scheduled maintenance and third-party API outages (Meta, TikTok, WhatsApp).
            Scheduled maintenance windows will be communicated at least 48 hours in advance.
          </P>

          <SectionTitle>9. Liability</SectionTitle>
          <P>
            Bedones undertakes to provide its services with due diligence and in accordance with
            industry standards. However, Bedones shall not be held liable for:
          </P>
          <P>
            — Service interruptions attributable to third-party providers (Meta, TikTok, WhatsApp,
            AWS) or telecommunications operators.
            <br />
            — Responses generated by AI agents, the content of which depends on the configuration
            defined by the Customer and the data available.
            <br />
            — Loss of revenue or customers resulting from automated interactions misconfigured by
            the Customer.
            <br />— Compliance of automated messages with the regulations applicable in the
            Customer&apos;s country (advertising, consumer protection).
          </P>
          <P>
            In any event, Bedones&apos; total liability shall not exceed the amounts paid by the
            Customer during the 12 months preceding the event giving rise to liability.
          </P>

          <SectionTitle>10. Customer Obligations</SectionTitle>
          <P>
            The Customer agrees to:
            <br />
            — Use the platform in compliance with these Terms and applicable regulations.
            <br />
            — Configure their AI agents responsibly and ensure that automated responses comply with
            applicable law.
            <br />
            — Not use the service to send spam, unlawful content, or unsolicited commercial
            communications.
            <br />
            — Comply with the terms of use of the third-party platforms to which their accounts are
            connected.
            <br />— Keep their account information and payment methods up to date.
          </P>

          <SectionTitle>11. Data Ownership</SectionTitle>
          <P>
            The Customer retains ownership of all data imported onto the platform (product catalog,
            conversations, customer data). In the event of termination, the Customer has 30 days to
            export their data using the tools provided for this purpose. After this period, data
            will be deleted in accordance with our Privacy Policy.
          </P>

          <SectionTitle>12. Right of Withdrawal</SectionTitle>
          <P>
            In accordance with Article L221-28 of the French Consumer Code, the right of withdrawal
            does not apply to the supply of digital content not provided on a tangible medium where
            performance has begun with the Customer&apos;s prior express consent and their express
            waiver of their right of withdrawal.
          </P>

          <SectionTitle>13. Amendments to the Terms</SectionTitle>
          <P>
            Bedones reserves the right to amend these Terms at any time. Amendments will be notified
            to the Customer by email at least 30 days before taking effect. Continued use of the
            service after that date constitutes acceptance of the updated Terms.
          </P>

          <SectionTitle>14. Cookies</SectionTitle>
          <P>
            When accessing the platform, users are prompted to express their cookie preferences
            through a consent dialog. This choice can be changed at any time. For more details,
            please refer to our <a href="/legal/privacy">privacy policy</a> and our{' '}
            <a href="/legal/mentions">legal notices</a>.
          </P>

          <SectionTitle>15. Governing Law and Disputes</SectionTitle>
          <P>
            These Terms are governed by Ivorian law. In the event of a dispute relating to the
            interpretation or performance of these Terms, the parties agree to seek an amicable
            resolution within 30 days. Failing an amicable agreement, the courts of Abidjan shall
            have exclusive jurisdiction.
          </P>
        </div>
      </div>
    </div>
  )
}
