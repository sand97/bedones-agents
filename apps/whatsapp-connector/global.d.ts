// global.d.ts — expose les types de @wppconnect/wa-js sur window.WPP
import * as WPP from '@wppconnect/wa-js'

declare global {
  interface Window {
    WPP: typeof WPP
  }
}

export {}
