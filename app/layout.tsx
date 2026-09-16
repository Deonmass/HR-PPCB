import AppShell from '@/components/AppShell';
import ChunkLoadRecovery from '@/components/ChunkLoadRecovery';
import 'sweetalert2/dist/sweetalert2.min.css';
import './globals.css';

export const metadata = {
  title: 'PPC Barnet RH',
  description: 'Gestion des données RH',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/img/ppc-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/img/ppc-icon.png', type: 'image/png' },
    ],
    apple: [{ url: '/img/ppc-icon-180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/img/ppc-icon-32.png',
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('app-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');var l=localStorage.getItem('app-locale');if(l==='en'||l==='fr')document.documentElement.lang=l;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ChunkLoadRecovery />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
