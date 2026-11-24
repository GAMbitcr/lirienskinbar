import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export type Tab = 'inventory' | 'scan' | 'cart' | 'alerts' | 'history' | 'more';
export interface Nav {
  tab: Tab;
  go: (tab: Tab) => void;
  openProduct: (productId: string) => void;
  /** null = producto nuevo */
  openEditor: (productId: string | null) => void;
  openCheckout: () => void;
}
export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = (): Nav => useContext(NavCtx);
