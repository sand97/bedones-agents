import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Typography, Collapse, Form, Input, Select, Button, Modal, message } from 'antd'
import { DashboardHeader } from '@app/components/layout/dashboard-header'
import { useLocale } from '@app/contexts/locale-context'
import {
  FileText,
  Shield,
  ShoppingCart,
  ExternalLink,
  HelpCircle,
  Headphones,
  Scale,
  ChevronDown,
  Send,
  MessageSquare,
  BookOpen,
} from 'lucide-react'

const { Title, Text } = Typography
const { TextArea } = Input

export const Route = createFileRoute('/app/$orgSlug/legal')({
  component: HelpPage,
})

/* ───────── Page ───────── */
function HelpPage() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [form] = Form.useForm()
  const [contactOpen, setContactOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /* ───────── FAQ ───────── */
  const faqItems = [
    {
      key: '1',
      label: t('help.faq_1_q'),
      children: t('help.faq_1_a'),
    },
    {
      key: '2',
      label: t('help.faq_2_q'),
      children: t('help.faq_2_a'),
    },
    {
      key: '3',
      label: t('help.faq_3_q'),
      children: t('help.faq_3_a'),
    },
    {
      key: '4',
      label: t('help.faq_4_q'),
      children: t('help.faq_4_a'),
    },
    {
      key: '5',
      label: t('help.faq_5_q'),
      children: t('help.faq_5_a'),
    },
    {
      key: '6',
      label: t('help.faq_6_q'),
      children: t('help.faq_6_a'),
    },
  ]

  /* ───────── Legal cards ───────── */
  const legalCards = [
    {
      icon: <FileText size={24} strokeWidth={1} />,
      title: t('help.legal_mentions_title'),
      description: t('help.legal_mentions_desc'),
      href: `/legal/${locale}/mentions`,
    },
    {
      icon: <Shield size={24} strokeWidth={1} />,
      title: t('help.legal_privacy_title'),
      description: t('help.legal_privacy_desc'),
      href: `/legal/${locale}/privacy`,
    },
    {
      icon: <ShoppingCart size={24} strokeWidth={1} />,
      title: t('help.legal_conditions_title'),
      description: t('help.legal_conditions_desc'),
      href: `/legal/${locale}/conditions`,
    },
  ]

  /* ───────── Support form options ───────── */
  const motifOptions = [
    { value: 'bug', label: t('help.motif_bug') },
    { value: 'feature', label: t('help.motif_feature') },
    { value: 'billing', label: t('help.motif_billing') },
    { value: 'account', label: t('help.motif_account') },
    { value: 'integration', label: t('help.motif_integration') },
    { value: 'other', label: t('help.motif_other') },
  ]

  const platformOptions = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'messenger', label: 'Messenger' },
    { value: 'general', label: t('help.platform_general') },
  ]

  const handleSubmit = async (values: Record<string, string>) => {
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 800))
    setSubmitting(false)
    form.resetFields()
    setContactOpen(false)
    message.success(t('help.success_message'))
    console.log('Support form submitted:', values)
  }

  return (
    <div>
      <DashboardHeader title={t('help.page_title')} />

      <div className="p-4 pb-16 lg:p-6 lg:pb-16">
        {/* ── FAQ ── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
              <HelpCircle size={20} strokeWidth={1} className="text-text-secondary" />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {t('help.faq_section_title')}
              </Title>
              <Text type="secondary" className="text-xs">
                {t('help.faq_section_subtitle')}
              </Text>
            </div>
          </div>

          <Collapse
            accordion
            bordered={false}
            expandIcon={({ isActive }) => (
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                style={{
                  transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            )}
            expandIconPosition="end"
            items={faqItems}
            className="help-faq-collapse"
          />
        </section>

        {/* ── Contacter le support ── */}
        <section className="mb-10">
          <div className="help-support-cta">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle">
              <Headphones size={24} strokeWidth={1} className="text-text-secondary" />
            </div>
            <Title level={5} style={{ margin: '12px 0 4px' }}>
              {t('help.support_title')}
            </Title>
            <Text type="secondary" className="mb-5 block text-sm leading-relaxed">
              {t('help.support_desc')}
            </Text>
            <Button
              type="primary"
              icon={<MessageSquare size={14} strokeWidth={1.5} />}
              onClick={() => setContactOpen(true)}
            >
              {t('help.support_btn')}
            </Button>
          </div>
        </section>

        {/* ── Modal formulaire de contact ── */}
        <Modal
          open={contactOpen}
          onCancel={() => setContactOpen(false)}
          title={t('help.contact_modal_title')}
          footer={null}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item
              name="contact"
              label={t('help.form_contact_label')}
              rules={[{ required: true, message: t('help.form_required') }]}
            >
              <Input placeholder={t('help.form_contact_placeholder')} />
            </Form.Item>

            <Form.Item
              name="motif"
              label={t('help.form_motif_label')}
              rules={[{ required: true, message: t('help.form_motif_required') }]}
            >
              <Select placeholder={t('help.form_motif_placeholder')} options={motifOptions} />
            </Form.Item>

            <Form.Item
              name="platform"
              label={t('help.form_platform_label')}
              rules={[{ required: true, message: t('help.form_platform_required') }]}
            >
              <Select placeholder={t('help.form_platform_placeholder')} options={platformOptions} />
            </Form.Item>

            <Form.Item
              name="description"
              label={t('help.form_description_label')}
              rules={[{ required: true, message: t('help.form_description_required') }]}
            >
              <TextArea rows={4} placeholder={t('help.form_description_placeholder')} />
            </Form.Item>

            <div className="flex justify-end">
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                icon={<Send size={14} strokeWidth={1.5} />}
              >
                {t('help.form_submit')}
              </Button>
            </div>
          </Form>
        </Modal>

        {/* ── Blog / Ressources ── */}
        <section className="mb-10">
          <div className="help-support-cta">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle">
              <BookOpen size={24} strokeWidth={1} className="text-text-secondary" />
            </div>
            <Title level={5} style={{ margin: '12px 0 4px' }}>
              {t('help.blog_title')}
            </Title>
            <Text type="secondary" className="mb-5 block text-sm leading-relaxed">
              {t('help.blog_desc')}
            </Text>
            <Button
              type="primary"
              icon={<BookOpen size={14} strokeWidth={1.5} />}
              href="/blog"
              target="_blank"
            >
              {t('help.blog_btn')}
            </Button>
          </div>
        </section>

        {/* ── Informations légales ── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle">
              <Scale size={20} strokeWidth={1} className="text-text-secondary" />
            </div>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {t('help.legal_section_title')}
              </Title>
              <Text type="secondary" className="text-xs">
                {t('help.legal_section_subtitle')}
              </Text>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {legalCards.map((card) => (
              <a
                key={card.href}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="legal-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-subtle text-text-secondary">
                    {card.icon}
                  </div>
                  <ExternalLink size={14} className="text-text-muted" />
                </div>
                <div className="mt-4">
                  <span className="text-sm font-semibold text-text-primary">{card.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                    {card.description}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
