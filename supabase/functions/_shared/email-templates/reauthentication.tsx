/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Section, Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, brandStyles } from './branded-layout.tsx'

interface ReauthenticationEmailProps {
  token: string
  brand?: EmailBrand
}

export const ReauthenticationEmail = ({
  token,
  brand = EMAIL_BRANDS.executiveteam,
}: ReauthenticationEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`Your verification code for ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Verification`}
      heading="Verification code"
      footer="If you did not initiate this request, you can safely disregard this email."
    >
      <Text style={styles.text}>
        Please use the code below to verify your identity on {brand.siteName}. This code is time-sensitive and should not be shared with anyone.
      </Text>
      <Section style={styles.codeContainer}>
        <Text style={styles.codeStyle}>{token}</Text>
      </Section>
      <Text style={styles.subtext}>This code will expire shortly. If you did not request it, no action is required.</Text>
    </BrandedEmailFrame>
  )
}

export default ReauthenticationEmail
