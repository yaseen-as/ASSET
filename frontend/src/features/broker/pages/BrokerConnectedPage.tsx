import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export default function BrokerConnectedPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/broker', { replace: true }), 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="text-center space-y-4">
        <CheckCircle2 className="mx-auto h-16 w-16 text-green-400" />
        <h1 className="text-2xl font-bold text-white">Broker Connected!</h1>
        <p className="text-gray-400">Your Upstox account has been authorized successfully.</p>
        <p className="text-sm text-gray-500">Redirecting to broker page…</p>
      </div>
    </div>
  );
}
