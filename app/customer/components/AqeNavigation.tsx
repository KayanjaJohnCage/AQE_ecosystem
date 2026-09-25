"use client";

import type { CustomerView } from "../types";

type NavigationItem = { label: string; icon: string; target: CustomerView };

const bottomItems: NavigationItem[] = [
  { label: "Home", icon: "fa-home", target: "home" },
  { label: "Explore", icon: "fa-compass", target: "discover" },
  { label: "Shop", icon: "fa-shopping-bag", target: "shop" },
  { label: "Chat", icon: "fa-comment", target: "messages" },
  { label: "Me", icon: "fa-user", target: "me" },
];

const drawerItems: NavigationItem[] = [
  { label: "Home", icon: "fa-home", target: "home" },
  { label: "Explore", icon: "fa-compass", target: "discover" },
  { label: "Marketplace", icon: "fa-shopping-bag", target: "shop" },
  { label: "Messages", icon: "fa-comment", target: "messages" },
  { label: "Book Now", icon: "fa-calendar-check", target: "bookings" },
  { label: "Comments", icon: "fa-comments", target: "comments" },
  { label: "My Profile", icon: "fa-user", target: "me" },
  { label: "Wallet", icon: "fa-wallet", target: "wallet" },
  { label: "Asset Room", icon: "fa-vault", target: "assetRoom" },
  { label: "Premium Hub", icon: "fa-star-half-alt", target: "premium" },
  { label: "VIP Hub", icon: "fa-crown", target: "vip" },
  { label: "Rewards", icon: "fa-gift", target: "rewards" },
  { label: "My Team", icon: "fa-users", target: "referrals" },
  { label: "Raffle", icon: "fa-ticket-alt", target: "raffle" },
  { label: "Settings", icon: "fa-cog", target: "settings" },
  { label: "Transactions", icon: "fa-receipt", target: "transactions" },
];

type Props = {
  accountName: string;
  authenticated: boolean;
  drawerOpen: boolean;
  onAccount: () => void;
  onAuthAction: () => void;
  onCloseDrawer: () => void;
  onNavigate: (target: CustomerView) => void;
  onOpenDrawer: () => void;
  onUpgrade: () => void;
  tier: string;
  view: CustomerView;
  walletCurrency: string;
};

export function AqeNavigation({
  accountName, authenticated, drawerOpen, onAccount, onAuthAction, onCloseDrawer,
  onNavigate, onOpenDrawer, onUpgrade, tier, view, walletCurrency,
}: Props) {
  const selectView = (target: CustomerView) => { onNavigate(target); onCloseDrawer(); };

  return <>
    <aside className="aqe-original-desktop-sidebar" aria-label="AQE ecosystem desktop navigation">
      <div className="aqe-desktop-logo">AQE ECOSYSTEM</div>
      <span className="aqe-desktop-section">Discover</span>
      {drawerItems.slice(0, 6).map((item) => <button type="button" key={item.target} className={view === item.target ? "active" : ""} onClick={() => onNavigate(item.target)}><i className={`fas ${item.icon}`} />{item.label}</button>)}
      <span className="aqe-desktop-section">Account</span>
      {drawerItems.slice(6, 8).map((item) => <button type="button" key={item.target} className={view === item.target ? "active" : ""} onClick={() => onNavigate(item.target)}><i className={`fas ${item.icon}`} />{item.label}</button>)}
      <span className="aqe-desktop-section">Premium</span>
      {drawerItems.slice(9, 10).map((item) => <button type="button" key={item.target} className={view === item.target ? "active" : ""} onClick={() => onNavigate(item.target)}><i className={`fas ${item.icon}`} />{item.label}</button>)}
      <span className="aqe-desktop-section">VIP</span>
      {drawerItems.slice(10, 14).map((item) => <button type="button" key={item.target} className={view === item.target ? "active" : ""} onClick={() => onNavigate(item.target)}><i className={`fas ${item.icon}`} />{item.label}<em>VIP</em></button>)}
      <div className="aqe-desktop-footer"><button type="button" onClick={onUpgrade}>Upgrade level</button></div>
    </aside>
    <header className="aqe-original-header">
      <button className="aqe-header-icon" type="button" onClick={onOpenDrawer} aria-label="Open menu"><i className="fas fa-bars" /></button>
      <div className="aqe-header-logo">AQE AfriQueerEcosystem</div>
      <div className="aqe-header-actions">
        <button className="currency-badge" type="button" onClick={onAccount}>{walletCurrency}</button>
        <button className="aqe-header-icon" type="button" onClick={onAccount} aria-label="Notifications"><i className="fas fa-bell" /></button>
      </div>
    </header>

    {drawerOpen ? <div className="aqe-original-drawer-backdrop" role="presentation" onClick={onCloseDrawer}>
      <aside className="aqe-original-drawer" aria-label="AQE ecosystem menu" onClick={(event) => event.stopPropagation()}>
        <div className="aqe-drawer-profile">
          <div className="aqe-drawer-avatar">{accountName.charAt(0).toUpperCase()}</div>
          <div><strong>{accountName}</strong><span>{authenticated ? `${tier.toUpperCase()} member` : "Not signed in"}</span></div>
        </div>
        <nav className="aqe-drawer-list">
          {drawerItems.map((item) => <button type="button" key={item.target} className={view === item.target ? "active" : ""} onClick={() => selectView(item.target)}>
            <i className={`fas ${item.icon}`} /> {item.label}
          </button>)}
        </nav>
        <div className="aqe-drawer-footer"><button className="aqe-original-auth" type="button" onClick={onAuthAction}>{authenticated ? "Sign Out" : "Sign In"}</button></div>
      </aside>
    </div> : null}

    <nav className="aqe-original-bottom-nav" aria-label="Primary navigation">
      {bottomItems.map((item) => <button className={view === item.target ? "active" : ""} type="button" key={item.label} onClick={() => onNavigate(item.target)}>
        <i className={`fas ${item.icon}`} /><span>{item.label}</span>
      </button>)}
    </nav>
  </>;
}
