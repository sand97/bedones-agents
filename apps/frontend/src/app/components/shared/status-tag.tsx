import { Tag } from 'antd'

interface StatusTagProps {
  label: string
  color: string
}

export function StatusTag({ label, color }: StatusTagProps) {
  return (
    <Tag
      bordered={false}
      style={{ background: color, color: '#fff', borderRadius: 9999, fontWeight: 600 }}
    >
      {label}
    </Tag>
  )
}
