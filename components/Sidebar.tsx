'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import ChangePasswordModal from './ChangePasswordModal';
import { useSidebar } from './SidebarContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { confirmLogout, showLogoutLoading } from '@/lib/swal';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  menuId?: string;
  menuIds?: string[];
  activePrefixes?: string[];
  excludePrefixes?: string[];
  /** Visually emphasize the item (e.g. Cash request inside Documents). */
  featured?: boolean;
};

type NavGroup = {
  type: 'group';
  id: string;
  title: string;
  icon: string;
  color: string;
  items: NavItem[];
};

type NavLinkSection = {
  type: 'link';
  id: string;
  href: string;
  label: string;
  icon: string;
  color: string;
  alwaysVisible?: boolean;
  /** Visible si l'utilisateur a « view » sur au moins un de ces menus. */
  menuIds?: string[];
  /** Préfixes de routes supplémentaires considérés comme actifs. */
  activePrefixes?: string[];
};

type NavSection = NavGroup | NavLinkSection;

const NAV: NavSection[] = [
  {
    type: 'link',
    id: 'home',
    href: '/accueil',
    label: 'Accueil',
    icon: 'home',
    color: '#e30613',
    alwaysVisible: true,
  },
  {
    type: 'link',
    id: 'exco',
    href: '/exco',
    label: 'EXCO',
    icon: 'dashboard',
    color: '#be123c',
    menuIds: ['exco.rapport'],
  },
  {
    type: 'link',
    id: 'audit',
    href: '/audit',
    label: 'Audit points',
    icon: 'docs',
    color: '#9f1239',
    menuIds: ['audit.points'],
  },
  {
    type: 'group',
    id: 'employes',
    title: 'Employés',
    icon: 'users',
    color: '#e30613',
    items: [
      { href: '/employes', label: 'Liste', icon: 'users', menuId: 'employes.liste', excludePrefixes: ['/employes/dependants', '/employes/offres', '/employes/mouvements', '/employes/postes', '/employes/contractants'] },
      { href: '/employes/dependants', label: 'Dependants', icon: 'users', menuId: 'employes.dependants' },
      { href: '/employes/offres', label: 'Offres', icon: 'docs', menuId: 'employes.offres' },
      { href: '/employes/mouvements', label: 'Mouvements', icon: 'users', menuId: 'employes.mouvements' },
      { href: '/employes/postes', label: 'Postes', icon: 'docs', menuId: 'employes.postes' },
      { href: '/employes/contractants', label: 'Contractants', icon: 'users', menuId: 'employes.contractants' },
      { href: '/check-documents', label: 'Check documents', icon: 'docs', menuId: 'employes.check-documents' },
      { href: '/heures-supplementaires', label: 'Heures supplémentaires', icon: 'clock', menuIds: ['employes.heures', 'employes.heures.dept', 'employes.heures.all'] },
    ],
  },
  {
    type: 'group',
    id: 'project',
    title: 'Project',
    icon: 'projects',
    color: '#06b6d4',
    items: [
      { href: '/project/dashboard', label: 'Dashboard', icon: 'dashboard', menuId: 'project.dashboard' },
      { href: '/project/projects', label: 'Projects', icon: 'projects', menuId: 'project.projects' },
      { href: '/project/expenses-details', label: 'Expenses details', icon: 'expenses', menuId: 'project.expenses' },
    ],
  },
  {
    type: 'link',
    id: 'documents',
    href: '/documents',
    label: 'Documents',
    icon: 'docs',
    color: '#a855f7',
    activePrefixes: ['/documents', '/documents-voyage'],
    menuIds: [
      'travel.historique',
      'travel.etablir',
      'travel.attestation',
      'travel.payment-voucher',
      'documents.appraisal',
      'documents.exit',
      'documents.entetes',
      'documents.rrf',
      'documents.newcomer',
      'documents.contrat-standard',
      'documents.attestation-conge',
      'documents.convention-collective',
    ],
  },
  {
    type: 'group',
    id: 'protocol',
    title: 'Protocol',
    icon: 'travel',
    color: '#6366f1',
    items: [
      {
        href: '/protocol/visa-travail',
        label: 'Visa de travail',
        icon: 'docs',
        menuId: 'protocol.visa-travail',
      },
      {
        href: '/protocol/visa-volant',
        label: 'Visa volant',
        icon: 'docs',
        menuId: 'protocol.visa-volant',
      },
      {
        href: '/protocol/visa-voyage',
        label: 'Visa de voyage',
        icon: 'travel',
        menuId: 'protocol.visa-voyage',
      },
      {
        href: '/protocol/billets',
        label: 'Gestion des Billets',
        icon: 'edit',
        menuId: 'protocol.billets',
      },
    ],
  },
  {
    type: 'group',
    id: 'fournisseurs-factures',
    title: 'Factures fournisseur',
    icon: 'docs',
    color: '#f97316',
    items: [
      { href: '/factures-fournisseurs/liste', label: 'Liste', icon: 'docs', menuId: 'factures.fournisseur.liste' },
      { href: '/factures-fournisseurs/factures', label: 'Factures', icon: 'docs', menuId: 'factures.fournisseur.factures' },
      { href: '/factures-fournisseurs/soa', label: 'SOA', icon: 'docs', menuId: 'factures.fournisseur.soa' },
      { href: '/factures-fournisseurs/fournisseurs', label: 'Fournisseurs', icon: 'docs', menuId: 'factures.fournisseur.fournisseurs' },
    ],
  },
  {
    type: 'link',
    id: 'sante',
    href: '/sante',
    label: 'Santé',
    icon: 'health',
    color: '#22c55e',
    menuIds: ['sante'],
  },
  {
    type: 'group',
    id: 'charroi',
    title: 'Charroi automobile',
    icon: 'car',
    color: '#f97316',
    items: [
      {
        href: '/charroi-automobile/vehicules',
        label: 'Base véhicules',
        icon: 'car',
        menuIds: ['charroi.vehicules', 'charroi'],
      },
      {
        href: '/charroi-automobile/achats',
        label: 'Nouveaux achats',
        icon: 'car',
        menuIds: ['charroi.achats', 'charroi'],
      },
    ],
  },
  {
    type: 'group',
    id: 'village',
    title: 'Village',
    icon: 'village',
    color: '#14b8a6',
    items: [
      {
        href: '/village/maisons',
        label: 'Maisons',
        icon: 'home',
        menuId: 'village.maisons',
        activePrefixes: ['/village/maisons'],
      },
      {
        href: '/village/maisons?tab=dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        menuId: 'village.dependants-dashboard',
        activePrefixes: ['/village/dashboard'],
      },
      {
        href: '/village/maisons?tab=liste',
        label: 'Liste',
        icon: 'users',
        menuId: 'village.dependants-liste',
        activePrefixes: ['/village/liste'],
      },
      { href: '/village/guest-house', label: 'Guest house', icon: 'village', menuId: 'village.guest-house' },
    ],
  },
  {
    type: 'group',
    id: 'parametres',
    title: 'Paramètres',
    icon: 'settings',
    color: '#94a3b8',
    items: [
      { href: '/parametres/departements', label: 'Départements', icon: 'settings', menuId: 'settings.departements' },
      { href: '/parametres/centres-de-cout', label: 'Centre de coût', icon: 'settings', menuId: 'settings.centres' },
      { href: '/parametres/utilisateurs', label: 'Utilisateurs', icon: 'users', menuId: 'settings.utilisateurs' },
      { href: '/parametres/permissions', label: 'Permissions', icon: 'docs', menuId: 'settings.permissions' },
      { href: '/parametres/logs', label: 'Logs', icon: 'history', menuId: 'parametres.logs' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  const pathOnly = href.split('?')[0];
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

function hrefTab(href: string): string | null {
  const q = href.indexOf('?');
  if (q < 0) return null;
  return new URLSearchParams(href.slice(q + 1)).get('tab');
}

function isNavItemActive(pathname: string, item: NavItem, search = '') {
  if (item.excludePrefixes?.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )) {
    return false;
  }

  const itemTab = hrefTab(item.href);
  const currentTab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
  const pathOnly = item.href.split('?')[0];

  // Liens avec ?tab=… (ex. Village) — match exact sur le tab courant.
  if (itemTab) {
    return pathname === pathOnly && currentTab === itemTab;
  }

  // Lien « Maisons » sans tab : actif seulement hors tabs dashboard/liste.
  if (
    pathOnly === '/village/maisons'
    && (pathname === '/village/maisons' || pathname.startsWith('/village/maisons/'))
  ) {
    return currentTab !== 'dashboard' && currentTab !== 'liste';
  }

  if (item.activePrefixes?.length) {
    return item.activePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return isActive(pathname, item.href);
}

function SidebarTip({
  label,
  enabled,
  color,
  children,
  hint,
}: {
  label: string;
  enabled: boolean;
  color?: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }, []);

  const show = useCallback(() => {
    if (!enabled) return;
    updatePos();
    setVisible(true);
  }, [enabled, updatePos]);

  const hide = useCallback(() => setVisible(false), []);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePos();
  }, [visible, updatePos]);

  useEffect(() => {
    if (!visible) return;
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, updatePos]);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  return (
    <>
      <span
        ref={wrapRef}
        className="sidebar-tip-wrap"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={visible ? id : undefined}
      >
        {children}
      </span>
      {visible && enabled && typeof document !== 'undefined' && createPortal(
        <span
          id={id}
          role="tooltip"
          className="sidebar-tip"
          style={{
            top: pos.top,
            left: pos.left,
            ['--tip-color' as string]: color || '#e30613',
          }}
        >
          <span className="sidebar-tip-arrow" aria-hidden />
          <span className="sidebar-tip-label">{label}</span>
          {hint ? <span className="sidebar-tip-hint">{hint}</span> : null}
        </span>,
        document.body,
      )}
    </>
  );
}

function NavIcon({ name, size = 16 }: { name: string; size?: number }) {
  const props = {
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'docs':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      );
    case 'clock':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'projects':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'expenses':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'health':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      );
    case 'car':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H10.3a2 2 0 0 0-1.6.6L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
    case 'village':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 21h18" />
          <path d="M5 21V10l7-6 7 6v11" />
          <path d="M9 21v-6h6v6" />
          <path d="M10 10h4" />
        </svg>
      );
    case 'travel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.2 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'history':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 3v5h5" />
          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          <path d="M12 7v5l4 2" />
        </svg>
      );
    case 'edit':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

function NavChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`nav-menu-chevron${open ? ' open' : ''}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function NavSubLink({
  item,
  color,
  collapsed,
}: {
  item: NavItem;
  color: string;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = isNavItemActive(pathname, item, searchParams.toString());

  return (
    <div className="nav-menu-row nav-menu-sub-row" style={{ '--nav-color': color } as CSSProperties}>
      <span className="nav-menu-bar nav-menu-bar-sub" aria-hidden />
      <SidebarTip label={item.label} enabled={collapsed} color={color}>
        <Link
          href={item.href}
          prefetch={false}
          className={`nav-menu-link nav-menu-sublink${active ? ' active' : ''}${item.featured ? ' featured' : ''}`}
          aria-label={collapsed ? item.label : undefined}
        >
          <span className="nav-menu-icon">
            <NavIcon name={item.icon} size={14} />
          </span>
          <span className="nav-menu-sublabel">{item.label}</span>
          {item.featured ? <span className="nav-menu-featured-mark" aria-hidden /> : null}
        </Link>
      </SidebarTip>
    </div>
  );
}

function NavGroupSection({
  section,
  collapsed,
  open,
  onToggle,
}: {
  section: NavGroup;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasActive = section.items.some((item) => isNavItemActive(pathname, item, searchParams.toString()));

  return (
    <div className={`nav-menu-section${collapsed && open ? ' collapsed-open' : ''}`} style={{ '--nav-color': section.color } as CSSProperties}>
      <div className="nav-menu-row nav-menu-header-row">
        <span className="nav-menu-bar" aria-hidden />
        <SidebarTip
          label={section.title}
          enabled={collapsed}
          color={section.color}
          hint={open ? 'Cliquer pour replier' : 'Cliquer pour déplier'}
        >
          <button
            type="button"
            className={`nav-menu-header${hasActive ? ' active' : ''}${open ? ' open' : ''}`}
            onClick={onToggle}
            aria-expanded={open}
            aria-label={section.title}
          >
            <span className="nav-menu-icon nav-menu-icon-header">
              <NavIcon name={section.icon} size={15} />
            </span>
            <span className="nav-menu-title">{section.title}</span>
            <NavChevron open={open} />
            {collapsed && (
              <span className={`nav-collapsed-dot${open ? ' open' : ''}`} aria-hidden />
            )}
          </button>
        </SidebarTip>
      </div>

      <div className={`nav-submenu${open ? ' open' : ''}`}>
        <div className="nav-submenu-inner">
          {section.items.map((item) => (
            <NavSubLink key={item.href} item={item} color={section.color} collapsed={collapsed} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavStandaloneSection({ section, collapsed }: { section: NavLinkSection; collapsed: boolean }) {
  const pathname = usePathname();
  const active =
    isActive(pathname, section.href) ||
    Boolean(section.activePrefixes?.some((prefix) => isActive(pathname, prefix)));

  return (
    <div className="nav-menu-section" style={{ '--nav-color': section.color } as CSSProperties}>
      <div className="nav-menu-row nav-menu-header-row">
        <span className="nav-menu-bar" aria-hidden />
        <SidebarTip label={section.label} enabled={collapsed} color={section.color}>
          <Link
            href={section.href}
            prefetch={false}
            className={`nav-menu-header nav-menu-standalone${active ? ' active' : ''}`}
            aria-label={collapsed ? section.label : undefined}
          >
            <span className="nav-menu-icon nav-menu-icon-header">
              <NavIcon name={section.icon} size={15} />
            </span>
            <span className="nav-menu-title">{section.label}</span>
          </Link>
        </SidebarTip>
      </div>
    </div>
  );
}

function buildInitialOpenGroups(pathname: string, search = '') {
  const initial: Record<string, boolean> = {};
  for (const section of NAV) {
    if (section.type === 'group') {
      initial[section.id] = section.items.some((item) => isNavItemActive(pathname, item, search));
    }
  }
  return initial;
}

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { collapsed, toggle } = useSidebar();
  const { theme, toggleTheme, isSwitching } = useTheme();
  const { user, can, isLoading: permissionsLoading } = usePermissions();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    buildInitialOpenGroups(pathname, typeof window !== 'undefined' ? window.location.search.slice(1) : ''),
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  const visibleNav = NAV.map((section) => {
    if (section.type === 'link') {
      if (section.alwaysVisible) return section;
      if (section.menuIds?.length) {
        return section.menuIds.some((id) => can(id, 'view')) ? section : null;
      }
      if (can(section.id, 'view')) return section;
      return null;
    }
    const items = section.items.filter((item) => {
      if (item.menuIds?.length) return item.menuIds.some((id) => can(id, 'view'));
      if (item.menuId) return can(item.menuId, 'view');
      return false;
    });
    if (!items.length) return null;
    return { ...section, items };
  }).filter((section): section is NavSection => section !== null);

  const handleLogout = async () => {
    if (loggingOut) return;
    if (!(await confirmLogout())) return;

    setLoggingOut(true);
    showLogoutLoading();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      // Timeout / réseau : on bascule quand même sur /login (cookie déjà vidé côté serveur si possible).
    } finally {
      window.clearTimeout(timeoutId);
      window.location.replace('/login');
    }
  };

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of NAV) {
        if (section.type === 'group' && section.items.some((item) => isNavItemActive(pathname, item, search))) {
          next[section.id] = true;
        }
      }
      return next;
    });
  }, [pathname, search]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-text">
              <h1>PPC Barnet RH</h1>
              <p>Gestion des données RH</p>
            </div>
          )}
          {collapsed && (
            <SidebarTip label="PPC Barnet RH" enabled color="#e30613" hint="Gestion des données RH">
              <span className="sidebar-brand-mini">RH</span>
            </SidebarTip>
          )}
        </div>
        <div className="sidebar-top-actions">
          <SidebarTip
            label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            enabled={collapsed}
            color="#94a3b8"
          >
            <button
              type="button"
              className="sidebar-theme-toggle"
              onClick={toggleTheme}
              disabled={isSwitching}
              aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
              title={!collapsed ? (theme === 'dark' ? 'Mode clair' : 'Mode sombre') : undefined}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {theme === 'dark' ? (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </>
                ) : (
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                )}
              </svg>
            </button>
          </SidebarTip>
          <SidebarTip
            label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
            enabled={collapsed}
            color="#94a3b8"
          >
            <button
              type="button"
              className="sidebar-toggle"
              onClick={toggle}
              aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {collapsed ? (
                  <>
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                  </>
                ) : (
                  <>
                    <polyline points="15 18 9 12 15 6" />
                    <line x1="9" y1="12" x2="21" y2="12" />
                  </>
                )}
              </svg>
            </button>
          </SidebarTip>
        </div>
      </div>

      <nav className="sidebar-nav">
        {!permissionsLoading &&
          visibleNav.map((section) =>
            section.type === 'group' ? (
              <NavGroupSection
                key={section.id}
                section={section}
                collapsed={collapsed}
                open={Boolean(openGroups[section.id])}
                onToggle={() => toggleGroup(section.id)}
              />
            ) : (
              <NavStandaloneSection key={section.id} section={section} collapsed={collapsed} />
            ),
          )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-profile-wrap" ref={profileRef}>
          <button
            type="button"
            className="sidebar-profile sidebar-profile-btn"
            onClick={() => setProfileMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            title="Options du compte"
          >
            <SidebarTip
              label={user?.displayName || 'Utilisateur'}
              enabled={collapsed}
              color="#e30613"
              hint={user?.username || undefined}
            >
              <span className="sidebar-profile-avatar">
                {user?.initials || 'RH'}
              </span>
            </SidebarTip>
            {!collapsed && (
              <div className="sidebar-profile-meta">
                <strong>{user?.displayName || 'Utilisateur'}</strong>
                <span>{user?.username || '—'}</span>
              </div>
            )}
          </button>
          {profileMenuOpen && (
            <div className="sidebar-profile-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="sidebar-profile-menu-item"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setPasswordModalOpen(true);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Modifier le mot de passe
              </button>
            </div>
          )}
        </div>
        <SidebarTip label="Déconnexion" enabled={collapsed} color="#e30613">
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            title={!collapsed ? 'Déconnexion' : undefined}
            aria-label="Déconnexion"
          >
            {loggingOut ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                {!collapsed ? 'Déconnexion…' : null}
              </>
            ) : (
              !collapsed ? 'Déconnexion' : '⎋'
            )}
          </button>
        </SidebarTip>
      </div>

      {passwordModalOpen && (
        <ChangePasswordModal mode="self" onClose={() => setPasswordModalOpen(false)} />
      )}
    </aside>
  );
}
