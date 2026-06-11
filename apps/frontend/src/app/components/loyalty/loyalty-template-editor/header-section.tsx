import { useTranslation } from 'react-i18next'
import { Button, Divider, Form, Input, Select, Upload } from 'antd'
import { Image as ImageIcon, Trash2, Video as VideoIcon } from 'lucide-react'
import type { HeaderType } from '../loyalty-template-preview'
import { MAX_HEADER_TEXT } from './constants'

interface HeaderSectionProps {
  headerType: HeaderType
  headerTypeOptions: { value: HeaderType; label: string }[]
  hasMpmTemplateButton: boolean
  headerMediaPreviewUrl: string
  onHeaderTypeChange: (val: HeaderType) => void
  clearMediaPreview: () => void
  onStageFile: (file: File) => void
}

/** "Header" section of the template editor (must be rendered inside the <Form>). */
export function LoyaltyTemplateHeaderSection({
  headerType,
  headerTypeOptions,
  hasMpmTemplateButton,
  headerMediaPreviewUrl,
  onHeaderTypeChange,
  clearMediaPreview,
  onStageFile,
}: HeaderSectionProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* ─── Section: Header ─── */}
      <Divider orientation="left" plain>
        {t('loyalty.section_header')}
      </Divider>

      <Form.Item label={t('loyalty.header_type')} required={hasMpmTemplateButton}>
        <Select value={headerType} onChange={onHeaderTypeChange} options={headerTypeOptions} />
      </Form.Item>

      {headerType === 'TEXT' && (
        <Form.Item
          label={t('loyalty.header_text')}
          name="headerText"
          rules={[{ max: MAX_HEADER_TEXT }]}
        >
          <Input
            placeholder={t('loyalty.header_text_placeholder')}
            maxLength={MAX_HEADER_TEXT}
            showCount
          />
        </Form.Item>
      )}

      {(headerType === 'IMAGE' || headerType === 'VIDEO') && (
        <Form.Item
          label={headerType === 'IMAGE' ? t('loyalty.header_image') : t('loyalty.header_video')}
        >
          {headerMediaPreviewUrl ? (
            <div className="flex items-center gap-3">
              {headerType === 'IMAGE' ? (
                <img
                  src={headerMediaPreviewUrl}
                  alt="header"
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ) : (
                <video
                  src={headerMediaPreviewUrl}
                  className="h-20 w-32 rounded-lg object-cover"
                  muted
                />
              )}
              <Button size="small" danger icon={<Trash2 size={14} />} onClick={clearMediaPreview}>
                {t('common.delete')}
              </Button>
            </div>
          ) : (
            <Upload.Dragger
              showUploadList={false}
              accept={headerType === 'IMAGE' ? '.jpg,.jpeg,.png,.webp' : '.mp4,.mov'}
              beforeUpload={(file) => {
                // Stage the file locally, no network call yet.
                // Actual upload happens on Create.
                onStageFile(file)
                return false
              }}
              customRequest={() => {}}
            >
              <div className="flex flex-col items-center gap-2 py-2">
                {headerType === 'IMAGE' ? (
                  <ImageIcon size={24} className="text-text-muted" />
                ) : (
                  <VideoIcon size={24} className="text-text-muted" />
                )}
                <span className="text-sm font-medium text-text-primary">
                  {headerType === 'IMAGE'
                    ? t('loyalty.header_upload_image')
                    : t('loyalty.header_upload_video')}
                </span>
              </div>
            </Upload.Dragger>
          )}
        </Form.Item>
      )}
    </>
  )
}
