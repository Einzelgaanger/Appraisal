/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Link, Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, CtaBlock, brandStyles } from './branded-layout.tsx'

interface SignupEmailProps {
  siteName?: string
  siteUrl?: string
  recipient: string
  confirmationUrl: string
  brand?: EmailBrand
}

export const SignupEmail = ({
  recipient,
  confirmationUrl,
  brand = EMAIL_BRANDS.executiveteam,
}: SignupEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`Verify your email for ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Access`}
      heading="Verify your access"
      footer={`If you did not create an account with ${brand.siteName}, please disregard this message.`}
    >
      <Text style={styles.text}>
        You have been added to the {brand.siteName} {brand.productName}. Confirm your email address to continue into your profile and workspace (
        <Link href={`mailto:${recipient}`} style={styles.link}>{recipient}</Link>
        ).
      </Text>
      <CtaBlock brand={brand} href={confirmationUrl} label="Verify Access" />
    </BrandedEmailFrame>
  )
}

export default SignupEmail
