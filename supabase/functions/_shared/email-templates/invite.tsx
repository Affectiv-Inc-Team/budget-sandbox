/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  token: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  token,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join <strong>{siteName}</strong>. Enter this
          one-time code on the Intrinsic sign-in page to create your password.
        </Text>
        <Section style={codeBox}>
          <Text style={code}>{token}</Text>
        </Section>
        <Text style={helpText}>
          This code is safer for business email systems that inspect links
          before delivering a message. Do not share it with anyone.
        </Text>
        <Button style={button} href={`${siteUrl}/login?setup=invite`}>
          Set up my account
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0A3D47',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#64748b',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#0E6B78',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const codeBox = {
  backgroundColor: '#F0F5F8',
  border: '1px solid #d0dae8',
  borderRadius: '8px',
  margin: '0 0 20px',
  padding: '18px 12px',
  textAlign: 'center' as const,
}
const code = {
  color: '#0A3D47',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  letterSpacing: '6px',
  margin: '0',
}
const helpText = { ...text, fontSize: '12px', margin: '0 0 24px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
