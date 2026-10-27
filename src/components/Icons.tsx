interface IconProps {
  className?: string
}

function Base({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ?? 'size-5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconDashboard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="10" width="7" height="11" rx="1.5" />
      <rect x="3" y="13" width="7" height="8" rx="1.5" />
    </Base>
  )
}

export function IconList(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconWallet(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconReport(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3" height="6" rx="0.8" />
      <rect x="11" y="8" width="3" height="10" rx="0.8" />
      <rect x="16" y="4" width="3" height="14" rx="0.8" />
    </Base>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Base>
  )
}

export function IconX(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Base>
  )
}

export function IconEdit(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </Base>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </Base>
  )
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </Base>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9.5 5 7 7-7 7" />
    </Base>
  )
}

export function IconAlert(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 13 4 4 10-10" />
    </Base>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Base {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </Base>
  )
}
