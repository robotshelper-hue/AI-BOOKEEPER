import React from 'react';
import { NavLink, useParams, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Bot,
  Receipt,
  Settings,
  LogOut,
  LayoutDashboard,
  ArrowLeft,
  BarChart3,
  FileText,
  Users,
  Repeat
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useRecurringTransactionGenerator } from '../hooks/useRecurringTransactionGenerator';

export default function Layout() {
  const { ledger } = useParams<{ ledger: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useRecurringTransactionGenerator(currentUser?.uid);

  const isBusiness = ledger === 'business';

  const navItems = [
    { name: 'AI Hub', path: `/ledger/${ledger}`, icon: Bot, exact: true },
    { name: 'Transactions', path: `/ledger/${ledger}/transactions`, icon: Receipt },
    { name: 'Recurring', path: `/ledger/${ledger}/recurring`, icon: Repeat },
    { name: 'Analytics', path: `/ledger/${ledger}/analytics`, icon: BarChart3 },
    ...(isBusiness ? [
      { name: 'Clients', path: `/ledger/${ledger}/clients`, icon: Users },
      { name: 'Invoices', path: `/ledger/${ledger}/invoices`, icon: FileText }
    ] : []),
    { name: 'Settings', path: `/ledger/${ledger}/settings`, icon: Settings },
  ];

  async function handleLogout() {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex fixed inset-y-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <LayoutDashboard className="w-6 h-6 text-indigo-600 mr-2" />
          <span className="text-lg font-bold text-gray-900">AI Bookkeeper</span>
        </div>
        
        <div className="px-6 py-4 border-b border-gray-100">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Ledgers
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium capitalize bg-indigo-50 text-indigo-700">
            {ledger} Ledger
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="text-sm font-medium text-gray-900 truncate pr-2">
              {currentUser?.email}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
