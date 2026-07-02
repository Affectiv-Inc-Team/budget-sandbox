/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  brand, main, container, brandBar, wordmark, subtitle,
  h1, text, button, footer,
} from './_styles.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Intrinsic sign-in link</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={wordmark}>{brand.name}</Text>
          <Text style={subtitle}>{brand.tagline}</Text>
        </div>
        <Heading style={h1}>Sign in to Intrinsic</Heading>
        <Text style={text}>
          Click the button below to sign in. This link expires shortly, so
          use it on the same device you requested it from.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Sign in
        </Button>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
