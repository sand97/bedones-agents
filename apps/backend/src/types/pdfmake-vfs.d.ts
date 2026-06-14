// Le sous-module de polices de pdfmake n'embarque pas de typings.
declare module 'pdfmake/build/vfs_fonts' {
  const content: { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> }
  export default content
}
