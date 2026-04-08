import './globals.css';
import { Suspense } from 'react';
import PageTransition from './PageTransition';

export const metadata = {
  title: 'MediConnect AI — Healthcare Intelligence Platform',
  description: 'AI-powered appointment and clinical communication platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html, body { background: #f7f9fc; margin: 0; padding: 0; }
          #__next_page { animation: fadeSlide 0.15s ease-out; }
          @keyframes fadeSlide {
            from { opacity: 0; transform: translateY(3px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </head>
      <body>
        <Suspense>
          <PageTransition />
        </Suspense>
        <div id="__next_page">
          {children}
        </div>
      </body>
    </html>
  );
}