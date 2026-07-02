/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  brand, main, container, brandBar, wordmark, subtitle,
  h1, text, button, link, footer,
} from './_styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to finish setting up Intrinsic</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={wordmark}>{brand.name}</Text>
          <Text style={subtitle}>{brand.tagline}</Text>
        </div>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for joining{' '}
          <Link href={siteUrl} style={link}><strong>Intrinsic</strong></Link>.
          Please confirm <strong>{recipient}</strong> to finish setting up your account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm email
        </Button>
        <Text style={footer}>
          If you didn't create an Intrinsic account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
