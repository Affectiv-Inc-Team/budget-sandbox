/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import {
  brand, main, container, brandBar, wordmark, subtitle,
  h1, text, codeStyle, footer,
} from './_styles.ts'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Intrinsic verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={wordmark}>{brand.name}</Text>
          <Text style={subtitle}>{brand.tagline}</Text>
        </div>
        <Heading style={h1}>Confirm it's you</Heading>
        <Text style={text}>Enter this verification code to continue:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. If you didn't request it, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
