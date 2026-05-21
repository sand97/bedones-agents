import { Modal, Steps, Typography, Button, Space } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const { Paragraph, Link } = Typography

interface TikTokBusinessGuideModalProps {
  open: boolean
  onClose: () => void
  onRetry: () => void
}

export function TikTokBusinessGuideModal({
  open,
  onClose,
  onRetry,
}: TikTokBusinessGuideModalProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)
  const [showAlternative, setShowAlternative] = useState(false)

  const handleRetry = () => {
    setCurrentStep(0)
    setShowAlternative(false)
    onRetry()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('tiktok_business.modal_title')}
      footer={null}
      width={600}
    >
      {!showAlternative ? (
        <div className="flex flex-col gap-4">
          <Paragraph type="secondary">{t('tiktok_business.description')}</Paragraph>

          <Steps
            current={currentStep}
            direction="vertical"
            items={[
              {
                title: t('tiktok_business.step1_title'),
                description: t('tiktok_business.step1_desc'),
              },
              {
                title: t('tiktok_business.step2_title'),
                description: t('tiktok_business.step2_desc'),
              },
              {
                title: t('tiktok_business.step3_title'),
                description: t('tiktok_business.step3_desc'),
              },
            ]}
          />

          <Space className="mt-4 flex justify-between">
            <Button onClick={() => setShowAlternative(true)}>
              {t('tiktok_business.cant_find_switch')}
            </Button>
            <Space>
              {currentStep < 2 && (
                <Button type="primary" onClick={() => setCurrentStep((s) => s + 1)}>
                  {t('tiktok_business.next')}
                </Button>
              )}
              {currentStep === 2 && (
                <Button type="primary" onClick={handleRetry}>
                  {t('tiktok_business.retry_connect')}
                </Button>
              )}
            </Space>
          </Space>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Paragraph type="secondary">{t('tiktok_business.alt_description')}</Paragraph>

          <Steps
            current={currentStep}
            direction="vertical"
            items={[
              {
                title: t('tiktok_business.alt_step1_title'),
                description: (
                  <span>
                    {t('tiktok_business.alt_step1_desc')}{' '}
                    <Link href="https://business.tiktok.com/" target="_blank">
                      business.tiktok.com
                    </Link>
                  </span>
                ),
              },
              {
                title: t('tiktok_business.alt_step2_title'),
                description: t('tiktok_business.alt_step2_desc'),
              },
              {
                title: t('tiktok_business.alt_step3_title'),
                description: t('tiktok_business.alt_step3_desc'),
              },
              {
                title: t('tiktok_business.alt_step4_title'),
                description: t('tiktok_business.alt_step4_desc'),
              },
            ]}
          />

          <Space className="mt-4 flex justify-between">
            <Button
              onClick={() => {
                setShowAlternative(false)
                setCurrentStep(0)
              }}
            >
              {t('tiktok_business.back')}
            </Button>
            <Space>
              {currentStep < 3 && (
                <Button type="primary" onClick={() => setCurrentStep((s) => s + 1)}>
                  {t('tiktok_business.next')}
                </Button>
              )}
              {currentStep === 3 && (
                <Button type="primary" onClick={handleRetry}>
                  {t('tiktok_business.retry_connect')}
                </Button>
              )}
            </Space>
          </Space>
        </div>
      )}
    </Modal>
  )
}
