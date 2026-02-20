import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Wallet,
  Menu,
  X,
  LogOut,
  ExternalLink,
  ShieldAlert,
  Activity as ActivityIcon,
  BarChart3,
} from "lucide-react";
import { useWallet } from "../../hooks/useWallet";

const DashboardLayout: React.FC = () => {
  const { isConnected, address, network, connect, disconnect } = useWallet();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const shortenAddress = (addr: string, chars = 4) => {
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  };

    const navItems = [
        { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
        { label: 'Proposals', path: '/dashboard/proposals', icon: FileText },
        { label: 'Activity', path: '/dashboard/activity', icon: ActivityIcon },
        { label: 'Analytics', path: '/dashboard/analytics', icon: BarChart3 },
        { label: 'Settings', path: '/dashboard/settings', icon: Settings },
    ];

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-800/50 backdrop-blur-md border-r border-gray-700/50 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            VaultDAO
          </h1>
          <button
            className="md:hidden text-gray-400 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="mt-6 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                                    isActive
                                        ? 'bg-purple-600 text-white'
                                        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                                onClick={() => setIsSidebarOpen(false)}
                            >
                                <Icon size={20} className="mr-3" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-gray-800/30 backdrop-blur-md border-b border-gray-700/50 h-20 flex items-center justify-between px-6 z-30">
          <button
            className="md:hidden text-gray-400 hover:text-white p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className="flex-1 hidden md:block">
            <p className="text-gray-400 text-sm font-medium">
              Welcome back to VaultDAO
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {isConnected && address ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-3 bg-gray-800 border border-gray-700 hover:border-purple-500/50 px-3 py-2 md:px-4 rounded-xl transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-xs">
                    {address.slice(0, 2)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs text-gray-400 leading-none mb-1">
                      Stellar Account
                    </p>
                    <p className="text-sm font-bold">
                      <span className="md:hidden">
                        {shortenAddress(address, 3)}
                      </span>
                      <span className="hidden md:inline lg:hidden">
                        {shortenAddress(address, 4)}
                      </span>
                      <span className="hidden lg:inline">
                        {shortenAddress(address, 6)}
                      </span>
                    </p>
                  </div>
                </button>

                {isUserMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsUserMenuOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-4 border-b border-gray-700 flex flex-col items-center">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center font-bold text-lg mb-3 shadow-lg">
                          {address.slice(0, 2)}
                        </div>
                        <p className="text-xs text-gray-400 font-medium mb-1">
                          Connected Address
                        </p>
                        <p className="text-xs font-mono break-all text-center px-2">
                          {address}
                        </p>
                      </div>

                      <div className="p-2">
                        {network !== "TESTNET" && (
                          <div className="m-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center text-yellow-500">
                            <ShieldAlert size={14} className="mr-2 shrink-0" />
                            <span className="text-[10px] font-bold">
                              WRONG NETWORK
                            </span>
                          </div>
                        )}

                        <button
                          className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
                          onClick={() =>
                            window.open(
                              `https://stellar.expert/explorer/testnet/account/${address}`,
                              "_blank",
                            )
                          }
                        >
                          <ExternalLink
                            size={16}
                            className="mr-3 text-gray-500"
                          />
                          View on Explorer
                        </button>
                        <button
                          onClick={() => {
                            disconnect();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <LogOut size={16} className="mr-3" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={connect}
                className="group relative flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-5 py-2.5 rounded-xl transition-all duration-300 font-bold overflow-hidden shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] active:scale-95"
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Wallet
                  size={18}
                  className="mr-2 group-hover:rotate-12 transition-transform"
                />
                <span className="relative">
                  Connect <span className="hidden sm:inline">Wallet</span>
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-purple-900/5 via-gray-900 to-gray-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;