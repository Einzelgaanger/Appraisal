export type EmailBrandSlug = 'executiveteam' | 'ghc' | 'vigipay'

export type EmailBrand = {
  slug: EmailBrandSlug
  siteName: string
  productName: string
  fromName: string
  siteUrl: string
  logoUrl: string
  logoAlt: string
  logoWidth: number
  accent: string
  buttonFg: string
  heading: string
  body: string
  muted: string
  pageBg: string
  cardBg: string
  border: string
  copyright: string
}

export const EMAIL_BRANDS: Record<EmailBrandSlug, EmailBrand> = {
  executiveteam: {
    slug: 'executiveteam',
    siteName: 'VGG Executive Team',
    productName: 'BOOM workspace',
    fromName: 'VGG Executive Team',
    siteUrl: 'https://executive.vgg.tools',
    logoUrl: 'https://executive.vgg.tools/favicon.png',
    logoAlt: 'Venture Garden Group',
    logoWidth: 40,
    accent: '#2e6f20',
    buttonFg: '#fbf8f1',
    heading: '#10211a',
    body: '#4a5f55',
    muted: '#6f7f77',
    pageBg: '#f7f3eb',
    cardBg: '#ffffff',
    border: '#cfd8d2',
    copyright: 'Venture Garden Group',
  },
  ghc: {
    slug: 'ghc',
    siteName: 'GreenHouse Capital',
    productName: 'workspace',
    fromName: 'GreenHouse Capital',
    siteUrl: 'https://ghc.vgg.tools',
    logoUrl: 'https://ghc.vgg.tools/ghc-favicon.png',
    logoAlt: 'GreenHouse Capital',
    logoWidth: 48,
    accent: '#003333',
    buttonFg: '#f7fbfb',
    heading: '#0a1f1f',
    body: '#3d4f4f',
    muted: '#6a7a7a',
    pageBg: '#f3f6f6',
    cardBg: '#ffffff',
    border: '#c5d4d4',
    copyright: 'GreenHouse Capital. A Venture Garden Group company',
  },
  vigipay: {
    slug: 'vigipay',
    siteName: 'VigiPay',
    productName: 'workspace',
    fromName: 'VigiPay',
    siteUrl: 'https://vigipay.vgg.tools',
    logoUrl: 'https://vigipay.vgg.tools/vigipay-favicon.png',
    logoAlt: 'VigiPay',
    logoWidth: 48,
    accent: '#003A48',
    buttonFg: '#f7fbfc',
    heading: '#062028',
    body: '#3a5258',
    muted: '#6a7f84',
    pageBg: '#f2f6f7',
    cardBg: '#ffffff',
    border: '#c5d4d8',
    copyright: 'VigiPay. A Venture Garden Group company',
  },
}

export function brandFromSlug(slug: string | null | undefined): EmailBrand {
  const key = (slug || '').trim().toLowerCase()
  if (key === 'ghc') return EMAIL_BRANDS.ghc
  if (key === 'vigipay') return EMAIL_BRANDS.vigipay
  return EMAIL_BRANDS.executiveteam
}

function slugFromHostname(hostname: string): string | null {
  const h = hostname.toLowerCase().split(':')[0]
  if (h.startsWith('ghc.')) return 'ghc'
  if (h.startsWith('vigipay.')) return 'vigipay'
  if (h.startsWith('executive.') || h.startsWith('executiveteam.') || h.startsWith('appraisal.')) {
    return 'executiveteam'
  }
  return null
}

/** Read company from a Supabase confirmation / recovery URL. */
export function slugFromConfirmationUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const direct = parsed.searchParams.get('tenant')
    if (direct) return direct.trim().toLowerCase()

    const redirect = parsed.searchParams.get('redirect_to')
    if (redirect) {
      try {
        const dest = new URL(redirect)
        const nested = dest.searchParams.get('tenant')
        if (nested) return nested.trim().toLowerCase()
        const fromRedirectHost = slugFromHostname(dest.hostname)
        if (fromRedirectHost) return fromRedirectHost
      } catch {
        // ignore malformed redirect_to
      }
    }

    return slugFromHostname(parsed.hostname)
  } catch {
    return null
  }
}

export function emailSubject(brand: EmailBrand, type: string): string {
  const subjects: Record<string, string> = {
    signup: `${brand.siteName} — Confirm your email`,
    invite: `${brand.siteName} — You're invited`,
    magiclink: `${brand.siteName} — Your sign-in link`,
    recovery: `${brand.siteName} — Reset your password`,
    email_change: `${brand.siteName} — Confirm email change`,
    reauthentication: `${brand.siteName} — Verification code`,
  }
  return subjects[type] || `${brand.siteName} — Notification`
}

export function fromHeader(brand: EmailBrand, fromDomain = 'vgg.tools'): string {
  return `${brand.fromName} <noreply@${fromDomain}>`
}
