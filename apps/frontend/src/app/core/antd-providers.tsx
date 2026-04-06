import AntdApp from 'antd/es/app'
import ConfigProvider from 'antd/es/config-provider'
import frFR from 'antd/es/locale/fr_FR'
import enUS from 'antd/es/locale/en_US'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { antdProviderProps } from './theme'

const antdLocales = { fr: frFR, en: enUS } as const

export default function AntdProviders({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const locale = antdLocales[i18n.language as keyof typeof antdLocales] || frFR

  return (
    <ConfigProvider {...antdProviderProps} locale={locale}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
