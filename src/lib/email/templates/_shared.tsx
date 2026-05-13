/**
 * Shared react-email primitives — brand-toned wrappers used by every Trochia
 * template (welcome / trial-ending / payment-failed / data-export-ready).
 *
 * Brand tokens (docs/BRAND.md) inlined: Ink #0A0E1A, Paper #FAFAF7, Signal
 * #F25C2A, Graphite #6B7280, Stone #ECEAE3. No emoji. Operator voice.
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

const TOKENS = {
  ink: '#0A0E1A',
  paper: '#FAFAF7',
  signal: '#F25C2A',
  graphite: '#6B7280',
  stone: '#ECEAE3',
} as const;

const bodyStyle = {
  backgroundColor: TOKENS.paper,
  color: TOKENS.ink,
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: '32px 0',
};

const containerStyle = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
  backgroundColor: TOKENS.paper,
  border: `1px solid ${TOKENS.stone}`,
  borderRadius: '12px',
};

const headingStyle = {
  fontSize: '24px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  margin: '0 0 16px',
  color: TOKENS.ink,
};

const paragraphStyle = {
  fontSize: '16px',
  lineHeight: 1.65,
  margin: '0 0 16px',
  color: TOKENS.ink,
};

const footerStyle = {
  fontSize: '13px',
  color: TOKENS.graphite,
  lineHeight: 1.5,
  margin: '24px 0 0',
};

const buttonStyle = {
  backgroundColor: TOKENS.ink,
  color: TOKENS.paper,
  display: 'inline-block',
  padding: '12px 20px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: '15px',
};

export interface EmailShellProps {
  preview: string;
  heading: string;
  children: ReactNode;
}

export function EmailShell({ preview, heading, children }: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: TOKENS.ink,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                margin: '0 0 24px',
              }}
            >
              Trochia
            </Text>
            <Heading style={headingStyle}>{heading}</Heading>
            {children}
          </Section>
          <Hr style={{ borderColor: TOKENS.stone, margin: '24px 0' }} />
          <Text style={footerStyle}>
            Trochia is the agentic operator for your raise. You are receiving
            this because you have a Trochia account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = {
  body: bodyStyle,
  container: containerStyle,
  heading: headingStyle,
  paragraph: paragraphStyle,
  footer: footerStyle,
  button: buttonStyle,
  tokens: TOKENS,
};
