import type { Metadata } from 'next';
import './globals.css';
import { Cairo } from 'next/font/google';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mindplicit Studio - استوديو الفيديوهات السيكولوجية',
  description: 'نظام متكامل لإنتاج فيديوهات علم النفس والماكيافيلية الطويلة مع توليد الصوتيات والذاكرة الخارجية الذكية وتحليل البيانات.',
  openGraph: {
    title: 'Mindplicit Studio - استوديو الفيديوهات السيكولوجية',
    description: 'نظام متكامل لإنتاج فيديوهات علم النفس والماكيافيلية الطويلة مع توليد الصوتيات والذاكرة الخارجية الذكية وتحليل البيانات.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mindplicit Studio - استوديو الفيديوهات السيكولوجية',
    description: 'نظام متكامل لإنتاج فيديوهات علم النفس والماكيافيلية الطويلة مع توليد الصوتيات والذاكرة الخارجية الذكية وتحليل البيانات.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body
        suppressHydrationWarning
        className={`${cairo.className} bg-slate-950 text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200`}
      >
        {children}
      </body>
    </html>
  );
}
