import AntdApp from 'antd/es/app'
import ConfigProvider from 'antd/es/config-provider'
import frFR from 'antd/es/locale/fr_FR'
import type { ReactNode } from 'react'

import { antdProviderProps } from './theme'

export default function AntdProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider {...antdProviderProps} locale={frFR}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
