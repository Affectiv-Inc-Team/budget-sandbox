/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  brand, main, container, brandBar, wordmark, subtitle,
  h1, text, button, link, footer,
} from './_styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to Intrinsic</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={wordmark}>{brand.name}</Text>
          <Text style={subtitle}>{brand.tagline}</Text>
        </div>
        <Heading style={h1}>You're invited to Intrinsic</Heading>
        <Text style={text}>
          Your agency has invited you to join{' '}
          <Link href={siteUrl} style={link}><strong>Intrinsic</strong></Link>
          {' '}— financial modeling for HCBS and IDD provider agencies.
          Accept the invitation to create your account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
