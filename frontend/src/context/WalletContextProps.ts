import { createContext } from "react";

export interface WalletContextType {
  isConnected: boolean;
  isInstalled: boolean;
  address: string | null;
  network: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextType | undefined>(
  undefined,
);
