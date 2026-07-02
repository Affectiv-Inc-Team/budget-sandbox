/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  brand, main, container, brandBar, wordmark, subtitle,
  h1, text, button, footer,
} from './_styles.ts'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Set or reset your Intrinsic password</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={wordmark}>{brand.name}</Text>
          <Text style={subtitle}>{brand.tagline}</Text>
        </div>
        <Heading style={h1}>Set your password</Heading>
        <Text style={text}>
          We received a request to set or reset the password on your Intrinsic account.
          Click the button below to choose a new password. The link expires in about an hour.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Set password
        </Button>
        <Text style={footer}>
          If you didn't request this, you can safely ignore this email —
          your password won't change.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
