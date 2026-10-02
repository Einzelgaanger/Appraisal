/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Link, Text } from 'npm:@react-email/components@0.0.22'
import { EMAIL_BRANDS, type EmailBrand } from './email-brand.ts'
import { BrandedEmailFrame, CtaBlock, brandStyles } from './branded-layout.tsx'

interface EmailChangeEmailProps {
  siteName?: string
  email: string
  newEmail: string
  confirmationUrl: string
  brand?: EmailBrand
}

export const EmailChangeEmail = ({
  email,
  newEmail,
  confirmationUrl,
  brand = EMAIL_BRANDS.executiveteam,
}: EmailChangeEmailProps) => {
  const styles = brandStyles(brand)
  return (
    <BrandedEmailFrame
      brand={brand}
      preview={`Confirm your email address change on ${brand.siteName}`}
      eyebrow={`${brand.siteName} / Account`}
      heading="Confirm email change"
      footer="If you did not request this change, please secure your account immediately by resetting your password."
    >
      <Text style={styles.text}>
        A request was made to update the email address on your {brand.siteName} account from{' '}
        <Link href={`mailto:${email}`} style={styles.link}>{email}</Link>
        {' '}to{' '}
        <Link href={`mailto:${newEmail}`} style={styles.link}>{newEmail}</Link>
        . Please confirm this change by clicking the button below.
      </Text>
      <CtaBlock brand={brand} href={confirmationUrl} label="Confirm Email Change" />
    </BrandedEmailFrame>
  )
}

export default EmailChangeEmail
