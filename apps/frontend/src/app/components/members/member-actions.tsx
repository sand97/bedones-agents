import { Button, Space } from 'antd'
import { Ban, Trash2 } from 'lucide-react'

export function MemberActions() {
  return (
    <Space size={4}>
      <Button variant={'outlined'} icon={<Ban size={15} />} size={'small'}>
        Bloquer
      </Button>
      <Button variant={'outlined'} size={'small'} danger icon={<Trash2 size={15} />}>
        Supprimer
      </Button>
    </Space>
  )
}
