import type { ConfigProviderProps } from 'antd'

export const antdProviderProps: ConfigProviderProps = {
  theme: {
    token: {
      colorPrimary: '#000000',
      borderRadius: 12,
      colorLink: '#000000',
      colorBgContainer: '#ffffff',
      fontFamily:
        "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Geist', ui-sans-serif, system-ui, sans-serif",
      colorText: '#111b21',
      colorTextSecondary: '#494949',
      colorBgLayout: 'transparent',
    },
    components: {
      Modal: {
        borderRadiusLG: 20,
        wireframe: true,
      },
      Button: {
        borderRadius: 10,
        controlHeight: 40,
        controlHeightSM: 34,
        controlHeightLG: 48,
        borderRadiusSM: 10,
        borderRadiusLG: 10,
        paddingInline: 20,
      },
      Input: {
        borderRadius: 10,
        controlHeight: 44,
        paddingInline: 16,
      },
      Select: {
        borderRadius: 10,
        controlHeight: 44,
      },
      Card: {
        borderRadiusLG: 16,
        boxShadowTertiary: '0px 0px 1px 0px rgba(0,0,0,0.08)',
      },
    },
  },
}
