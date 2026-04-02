import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface LayoutContextType {
  collapsed: boolean
  isDesktop: boolean
  mobileMenuOpen: boolean
  toggleCollapsed: () => void
  setMobileMenuOpen: (open: boolean) => void
}

const LayoutContext = createContext<LayoutContextType | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const toggleCollapsed = () => {
    if (isDesktop) {
      setCollapsed((c) => !c)
    } else {
      setMobileMenuOpen((o) => !o)
    }
  }

  return (
    <LayoutContext.Provider
      value={{ collapsed, isDesktop, mobileMenuOpen, toggleCollapsed, setMobileMenuOpen }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider')
  return ctx
}
