import './globals.css';
import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'JSM Assets Schema Designer',
  description: 'Visual designer for Atlassian JSM Assets schema and mappings.',
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
