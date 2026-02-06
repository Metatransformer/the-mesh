import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Mesh',
  description: 'Secure P2P command center for AI agent swarms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-mesh-bg text-mesh-text antialiased">
        {children}
      </body>
    </html>
  );
}
