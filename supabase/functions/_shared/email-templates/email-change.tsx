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
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = Deno.env.get('EMAIL_LOGO_URL') || 'https://executive.vgg.tools/vgg-logo.webp'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email address change on VGG 360° Appraisal</Preview>
    <Body style={main}>
      <Container style={outerContainer}>
        <Section style={headerSection}>
          <Img src={LOGO_URL} alt="Venture Garden Group" width="140" height="auto" style={logo} />
        </Section>
        <Section style={contentSection}>
          <Text style={eyebrow}>VGG 360° Appraisal / Account Update</Text>
          <Heading style={h1}>Confirm email change</Heading>
          <Text style={text}>
            A request was made to update the email address on your VGG 360° Appraisal account from{' '}
            <Link href={`mailto:${email}`} style={link}>{email}</Link>
            {' '}to{' '}
            <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
            {' '}Please confirm this change by clicking the button below.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={confirmationUrl}>
              Confirm Email Change
            </Button>
          </Section>
          <Text style={dividerText}>— or copy this link into your browser —</Text>
          <Text style={urlText}>{confirmationUrl}</Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>If you did not request this change, please secure your account immediately by resetting your password.</Text>
        <Text style={copyright}>© {new Date().getFullYear()} Venture Garden Group. All rights reserved.</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = { backgroundColor: '#f7f3eb', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const outerContainer = { maxWidth: '600px', margin: '0 auto', padding: '28px 16px 40px' }
const headerSection = { textAlign: 'left' as const, padding: '0 0 18px', borderBottom: '1px solid #cfd8d2', margin: '0 0 16px' }
const logo = { margin: '0', display: 'block' }
const contentSection = { backgroundColor: '#ffffff', borderRadius: '4px', padding: '34px 28px', border: '1px solid #cfd8d2', borderTop: '6px solid #2e6f20' }
const eyebrow = { fontSize: '10px', fontWeight: '700' as const, color: '#2e6f20', margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const h1 = { fontFamily: "'Fraunces', Georgia, serif", fontSize: '30px', fontWeight: '500' as const, color: '#10211a', margin: '0 0 18px', lineHeight: '1.05', letterSpacing: '0' }
const text = { fontSize: '15px', color: '#4a5f55', lineHeight: '1.7', margin: '0 0 26px' }
const link = { color: '#2e6f20', textDecoration: 'underline' }
const buttonContainer = { textAlign: 'center' as const, margin: '4px 0 28px' }
const button = { backgroundColor: '#2e6f20', color: '#fbf8f1', fontSize: '13px', fontWeight: '700' as const, borderRadius: '4px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block', textTransform: 'uppercase' as const, letterSpacing: '1.4px' }
const dividerText = { fontSize: '10px', color: '#6f7f77', textAlign: 'center' as const, margin: '0 0 8px', letterSpacing: '1.6px', textTransform: 'uppercase' as const }
const urlText = { fontSize: '11px', color: '#2e6f20', wordBreak: 'break-all' as const, margin: '0', textAlign: 'center' as const }
const hr = { borderColor: '#cfd8d2', margin: '24px 0 14px' }
const footer = { fontSize: '12px', color: '#6f7f77', textAlign: 'left' as const, margin: '0 0 8px', lineHeight: '1.5' }
const copyright = { fontSize: '11px', color: '#8c9993', textAlign: 'left' as const, margin: '0', textTransform: 'uppercase' as const, letterSpacing: '1.2px' }
