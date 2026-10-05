/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import type { EmailBrand } from './email-brand.ts'

export function BrandedEmailFrame({
  brand,
  preview,
  eyebrow,
  heading,
  children,
  footer,
}: {
  brand: EmailBrand
  preview: string
  eyebrow: string
  heading: string
  children: React.ReactNode
  footer: string
}) {
  const year = new Date().getFullYear()
  const styles = brandStyles(brand)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.outerContainer}>
          <Section style={styles.contentSection}>
            <img
              src="cid:company-logo"
              alt={brand.logoAlt}
              width={brand.logoWidth}
              height={brand.logoHeight}
              style={styles.logo}
            />
            <Hr style={styles.logoRule} />
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Heading style={styles.h1}>{heading}</Heading>
            {children}
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{footer}</Text>
          <Text style={styles.copyright}>© {year} {brand.copyright}. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export function brandStyles(brand: EmailBrand) {
  return {
    main: {
      backgroundColor: brand.pageBg,
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    outerContainer: { maxWidth: '600px', margin: '0 auto', padding: '28px 16px 40px' },
    logo: {
      margin: '0 0 18px',
      display: 'block' as const,
      border: '0',
      outline: 'none',
      width: `${brand.logoWidth}px`,
      height: `${brand.logoHeight}px`,
    },
    logoRule: { borderColor: brand.border, margin: '0 0 22px' },
    contentSection: {
      backgroundColor: brand.cardBg,
      borderRadius: '4px',
      padding: '28px 28px 34px',
      border: `1px solid ${brand.border}`,
    },
    eyebrow: {
      fontSize: '10px',
      fontWeight: '700' as const,
      color: brand.accent,
      margin: '0 0 12px',
      textTransform: 'uppercase' as const,
      letterSpacing: '2px',
    },
    h1: {
      fontFamily: "'Fraunces', Georgia, serif",
      fontSize: '30px',
      fontWeight: '500' as const,
      color: brand.heading,
      margin: '0 0 18px',
      lineHeight: '1.05',
      letterSpacing: '0',
    },
    text: { fontSize: '15px', color: brand.body, lineHeight: '1.7', margin: '0 0 26px' },
    link: { color: brand.accent, textDecoration: 'underline' },
    buttonContainer: { textAlign: 'center' as const, margin: '4px 0 28px' },
    button: {
      backgroundColor: brand.accent,
      color: brand.buttonFg,
      fontSize: '13px',
      fontWeight: '700' as const,
      borderRadius: '4px',
      padding: '14px 28px',
      textDecoration: 'none',
      display: 'inline-block',
      textTransform: 'uppercase' as const,
      letterSpacing: '1.4px',
    },
    dividerText: {
      fontSize: '10px',
      color: brand.muted,
      textAlign: 'center' as const,
      margin: '0 0 8px',
      letterSpacing: '1.6px',
      textTransform: 'uppercase' as const,
    },
    urlText: {
      fontSize: '11px',
      color: brand.muted,
      wordBreak: 'break-all' as const,
      margin: '0',
      textAlign: 'center' as const,
    },
    codeContainer: {
      textAlign: 'center' as const,
      backgroundColor: brand.pageBg,
      borderRadius: '4px',
      padding: '24px',
      margin: '0 0 24px',
      border: `1px solid ${brand.border}`,
    },
    codeStyle: {
      fontFamily: "'JetBrains Mono', 'SF Mono', Courier, monospace",
      fontSize: '34px',
      fontWeight: '700' as const,
      color: brand.accent,
      letterSpacing: '8px',
      margin: '0',
    },
    subtext: { fontSize: '12px', color: brand.muted, lineHeight: '1.5', margin: '0', textAlign: 'center' as const },
    hr: { borderColor: brand.border, margin: '24px 0 14px' },
    footer: { fontSize: '12px', color: brand.muted, textAlign: 'left' as const, margin: '0 0 8px', lineHeight: '1.5' },
    copyright: {
      fontSize: '11px',
      color: brand.muted,
      textAlign: 'left' as const,
      margin: '0',
      textTransform: 'uppercase' as const,
      letterSpacing: '1.2px',
    },
  }
}

export function CtaBlock({
  brand,
  href,
  label,
}: {
  brand: EmailBrand
  href: string
  label: string
}) {
  const styles = brandStyles(brand)
  return (
    <>
      <Section style={styles.buttonContainer}>
        <Button style={styles.button} href={href}>
          {label}
        </Button>
      </Section>
      <Text style={styles.dividerText}>— or copy this link into your browser —</Text>
      <Text style={styles.urlText}>{href}</Text>
    </>
  )
}
