import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setMessage('');
      setError('');
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      setMessage('Check your inbox for further instructions');
    } catch (err: any) {
      setError('Failed to reset password. Make sure the email is correct.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-blue-600">
          <KeyRound className="w-12 h-12" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Reset Password
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 p-4 rounded-md flex items-center text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 bg-green-50 p-4 rounded-md flex items-center text-green-700 text-sm">
              <CheckCircle2 className="w-5 h-5 mr-2" />
              {message}
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Reset Password'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 text-sm">
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
