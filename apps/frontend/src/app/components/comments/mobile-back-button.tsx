import { useNavigate } from '@tanstack/react-router'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'

export function MobileBackButton() {
  const navigate = useNavigate()

  return (
    <Button
      type="text"
      onClick={() =>
        navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, post: undefined }) as never,
        })
      }
      icon={<ArrowLeft size={18} strokeWidth={1.5} />}
      className="p-0!"
    >
      Posts
    </Button>
  )
}
