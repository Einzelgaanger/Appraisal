/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = Deno.env.get('EMAIL_LOGO_URL') || 'https://executive.vgg.tools/vgg-logo.webp'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code for VGG 360° Appraisal</Preview>
    <Body style={main}>
      <Container style={outerContainer}>
        <Section style={headerSection}>
          <Img src={LOGO_URL} alt="Venture Garden Group" width="140" height="auto" style={logo} />
        </Section>
        <Section style={contentSection}>
          <Text style={eyebrow}>VGG 360° Appraisal / Verification</Text>
          <Heading style={h1}>Verification code</Heading>
          <Text style={text}>
            Please use the code below to verify your identity on the VGG 360° Appraisal platform. This code is time-sensitive and should not be shared with anyone.
          </Text>
          <Section style={codeContainer}>
            <Text style={codeStyle}>{token}</Text>
          </Section>
          <Text style={subtext}>This code will expire shortly. If you did not request it, no action is required.</Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>If you did not initiate this request, you can safely disregard this email.</Text>
        <Text style={copyright}>© {new Date().getFullYear()} Venture Garden Group. All rights reserved.</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#f7f3eb', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const outerContainer = { maxWidth: '600px', margin: '0 auto', padding: '28px 16px 40px' }
const headerSection = { textAlign: 'left' as const, padding: '0 0 18px', borderBottom: '1px solid #cfd8d2', margin: '0 0 16px' }
const logo = { margin: '0', display: 'block' }
const contentSection = { backgroundColor: '#ffffff', borderRadius: '4px', padding: '34px 28px', border: '1px solid #cfd8d2', borderTop: '6px solid #2e6f20' }
const eyebrow = { fontSize: '10px', fontWeight: '700' as const, color: '#2e6f20', margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const h1 = { fontFamily: "'Fraunces', Georgia, serif", fontSize: '30px', fontWeight: '500' as const, color: '#10211a', margin: '0 0 18px', lineHeight: '1.05', letterSpacing: '0' }
const text = { fontSize: '15px', color: '#4a5f55', lineHeight: '1.7', margin: '0 0 26px' }
const codeContainer = { textAlign: 'center' as const, backgroundColor: '#f7f3eb', borderRadius: '4px', padding: '24px', margin: '0 0 24px', border: '1px solid #cfd8d2' }
const codeStyle = { fontFamily: "'JetBrains Mono', 'SF Mono', Courier, monospace", fontSize: '34px', fontWeight: '700' as const, color: '#2e6f20', letterSpacing: '8px', margin: '0' }
const subtext = { fontSize: '12px', color: '#6f7f77', lineHeight: '1.5', margin: '0', textAlign: 'center' as const }
const hr = { borderColor: '#cfd8d2', margin: '24px 0 14px' }
const footer = { fontSize: '12px', color: '#6f7f77', textAlign: 'left' as const, margin: '0 0 8px', lineHeight: '1.5' }
const copyright = { fontSize: '11px', color: '#8c9993', textAlign: 'left' as const, margin: '0', textTransform: 'uppercase' as const, letterSpacing: '1.2px' }
