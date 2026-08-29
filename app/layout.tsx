import AppShell from '@/components/AppShell';
import ChunkLoadRecovery from '@/components/ChunkLoadRecovery';
import 'sweetalert2/dist/sweetalert2.min.css';
import './globals.css';

export const metadata = {
  title: 'PPC Barnet RH',
  description: 'Gestion des données RH',
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('app-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');var l=localStorage.getItem('app-locale');if(l==='en'||l==='fr')document.documentElement.lang=l;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
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
