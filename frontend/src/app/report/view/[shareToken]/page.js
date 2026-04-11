/**
 * src/app/report/view/[shareToken]/page.js
 *
 * SERVER COMPONENT — no 'use client' here.
 *
 * WHY THIS FIXES THE WHATSAPP "LINK UNAVAILABLE" ISSUE:
 * WhatsApp's link preview bot fetches the URL and looks for Open Graph
 * meta tags (<meta property="og:title" ...>). It cannot run JavaScript,
 * so a 'use client' page renders blank for the bot → "Link is unavailable".
 *
 * This file is a Server Component that:
 *   1. Exports generateMetadata() — Next.js injects OG meta tags into the
 *      <head> server-side, so WhatsApp's bot sees them immediately.
 *   2. Renders <ReportViewClient> — the actual interactive UI (client component).
 *
 * WhatsApp bot sees:  <meta og:title="Medical Report Shared With You" ...>
 * Real users see:     The full login gate / report viewer UI
 */

import { Metadata } from 'next';
import ReportViewClient from './ReportViewClient';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediconnect-healthcare-system.vercel.app';
const API     = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';

// Required for Next.js static export with dynamic routes
export function generateStaticParams() { return []; }

export const dynamic = 'force-dynamic';

/**
 * generateMetadata — runs on the server before the page renders.
 * Returns Open Graph tags that WhatsApp, iMessage, Telegram etc. all read.
 */
export async function generateMetadata({ params }) {
  const { shareToken } = params;

  // Try to fetch minimal report info for the preview (title/description)
  // If it fails (expired, not found) we fall back to generic text.
  let title       = 'Medical Report Shared With You';
  let description = 'A medical report has been shared with you via NexMedicon AI. Log in to view it securely.';
  let reportType  = '';

  try {
    const r = await fetch(`${API}/reports/shared/${shareToken}/meta`, {
      next: { revalidate: 0 }, // never cache
    });
    if (r.ok) {
      const d = await r.json();
      if (d.reportType) {
        reportType  = d.reportType;
        title       = `${d.reportType} — Shared with you`;
        description = `${d.patientName ? d.patientName + ' has' : 'Someone has'} shared a ${d.reportType} with you via NexMedicon AI. Log in to view your results securely.`;
      }
    }
  } catch {
    // Fallback to generic text — still works fine for WhatsApp
  }

  const pageUrl = `${APP_URL}/report/view/${shareToken}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:       pageUrl,
      siteName:  'NexMedicon AI',
      type:      'website',
      images: [
        {
          // Use a static OG image hosted on your domain
          // Replace with your actual OG image URL, or use a default one
          url:    `${APP_URL}/og-report.png`,
          width:  1200,
          height: 630,
          alt:    'NexMedicon AI — Medical Report',
        },
      ],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      [`${APP_URL}/og-report.png`],
    },
    // Canonical URL
    alternates: { canonical: pageUrl },
  };
}

/**
 * Page component — renders the client-side report viewer.
 * The shareToken is passed as a prop so the client component can use it.
 */
export default function ReportViewPage({ params }) {
  return <ReportViewClient shareToken={params.shareToken} />;
}