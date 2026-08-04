import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UnifiedAgentTab from '../components/UnifiedAgentTab';

export default function Dashboard() {
  const { ledger } = useParams<{ ledger: string }>();
  const { currentUser } = useAuth();

  if (!currentUser) return null;

  const isPersonal = ledger === 'personal';
  const currency = isPersonal ? 'PHP (₱)' : 'USD ($)';

  return (
    <div className="max-w-4xl w-full mx-auto space-y-8">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 capitalize">
              {ledger} Finance
            </h1>
            <p className="text-gray-500 mt-1">
              Currency: <span className="font-semibold text-gray-700">{currency}</span>
            </p>
          </div>
        </div>
      </div>

      <div>
        <UnifiedAgentTab ledger={ledger || 'personal'} userId={currentUser.uid} />
      </div>
    </div>
  );
}
