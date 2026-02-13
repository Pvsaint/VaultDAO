import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { isAllowed, setAllowed, getUserInfo } from '@stellar/freighter-api';

interface WalletContextType {
    isConnected: boolean;
    address: string | null;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [address, setAddress] = useState<string | null>(null);

    useEffect(() => {
        checkConnection();
    }, []);

    const checkConnection = async () => {
        if (await isAllowed()) {
            const userInfo = await getUserInfo();
            if (userInfo?.publicKey) {
                setIsConnected(true);
                setAddress(userInfo.publicKey);
            }
        }
    };

    const connect = async () => {
        try {
            await setAllowed();
            await checkConnection();
        } catch (e) {
            console.error("Failed to connect wallet", e);
        }
    };

    const disconnect = async () => {
        // Freighter doesn't have a clear "disconnect" from dApp side, 
        // but we can clear local state.
        setIsConnected(false);
        setAddress(null);
    };

    return (
        <WalletContext.Provider value={{ isConnected, address, connect, disconnect }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
