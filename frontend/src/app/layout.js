import './globals.css';

export const metadata = {
  title:       'MediConnect AI',
  description: 'AI-powered healthcare platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ background: '#0c1a2e' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/*
        body background matches collapsed sidebar width (60px navy) + content area.
        This prevents any white flash while React hydrates.
      */}
      <body style={{
        background:      '#f7f9fc',
        backgroundImage: 'linear-gradient(90deg, #0c1a2e 60px, #f7f9fc 60px)',
        margin:          0,
      }}>
        <div id="__mc_page">
          {children}
        </div>
      </body>
    </html>
  );
}