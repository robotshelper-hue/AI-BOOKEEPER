import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wallet, Briefcase, LogOut } from 'lucide-react';

export default function LedgerSelection() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <button
          onClick={handleLogout}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </button>
      </div>

      <div className="max-w-2xl w-full text-center space-y-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
            Welcome to AI Bookkeeper
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Choose a ledger to continue. Personal finances are tracked in PHP, while business finances are tracked in USD.
          </p>
          <p className="text-sm font-medium text-blue-600">
            Logged in as {currentUser?.email}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Personal Ledger Card */}
          <button
            onClick={() => navigate('/ledger/personal')}
            className="relative group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-blue-500 transition-all duration-200 text-left overflow-hidden flex flex-col items-start"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative">
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-6">
                <Wallet className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Personal Finance</h3>
              <p className="text-gray-500 mb-6 flex-grow">
                Manage your personal expenses and income.
              </p>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                Currency: PHP (₱)
              </div>
            </div>
          </button>

          {/* Business Ledger Card */}
          <button
            onClick={() => navigate('/ledger/business')}
            className="relative group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:emerald-border-500 transition-all duration-200 text-left overflow-hidden flex flex-col items-start"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative">
              <div className="p-3 bg-emerald-100 rounded-lg w-fit mb-6">
                <Briefcase className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Business Finance</h3>
              <p className="text-gray-500 mb-6 flex-grow">
                Track your business operations and cash flow.
              </p>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                Currency: USD ($)
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
