import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { EnvironmentBanner, Icon } from '@ccih/ui';
import { useDataSource, useInstitution } from '../data/source';
import { ErrorBoundary } from './ErrorBoundary';
import { NAVIGATION } from './navigation';
import { THEME_LABEL, useTheme } from './theme';

export function AppShell() {
  const source = useDataSource();
  const institution = useInstitution();
  const [theme, cycleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="app ig-root">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      {source.origin === 'demo' ? <EnvironmentBanner /> : null}
      <header className="topbar">
        <button type="button" className="ig-btn ig-btn-ghost ig-btn-sm topbar-menu" aria-expanded={menuOpen} aria-controls="menu-principal" onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'close' : 'menu'} size={18} />
          <span className="ig-sr-only">Menu</span>
        </button>
        <div className="brand">
          <span className="brand-name">CCIH Integra</span>
          <span className="brand-inst">{institution.data?.data.config.institutionName ?? ' '}</span>
        </div>
        <div className="topbar-tools">
          <button type="button" className="ig-btn ig-btn-ghost ig-btn-sm" onClick={cycleTheme} aria-label={`${THEME_LABEL[theme]}. Alternar tema`}>
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
            <span className="hide-sm">{THEME_LABEL[theme]}</span>
          </button>
        </div>
      </header>
      <div className="layout">
        <nav id="menu-principal" className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Principal">
          {NAVIGATION.map((group, gi) => (
            <div key={gi} className="nav-group">
              {group.label ? <p className="nav-group-label">{group.label}</p> : null}
              <ul>
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                      <span>{item.label}</span>
                      {item.phase ? <span className="nav-phase"><span className="ig-sr-only"> — em desenvolvimento, </span>Fase {item.phase}</span> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main id="conteudo" className="main" tabIndex={-1}>
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
