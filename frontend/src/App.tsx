import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

// Layouts
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';

// Auth Pages
import LoginPage from '@/features/auth/pages/LoginPage';
import RegisterPage from '@/features/auth/pages/RegisterPage';
import VerifyOtpPage from '@/features/auth/pages/VerifyOtpPage';

// Dashboard Pages
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import PortfolioPage from '@/features/portfolio/pages/PortfolioPage';
import WatchlistPage from '@/features/portfolio/pages/WatchlistPage';
import AlertsPage from '@/features/alerts/pages/AlertsPage';
import RecommendationsPage from '@/features/recommendations/pages/RecommendationsPage';
import MarketPage from '@/features/market/pages/MarketPage';
import OrderPage from '@/features/orders/pages/OrderPage';
import PaperTradingPage from '@/features/paper-trading/pages/PaperTradingPage';
import AnalyticsPage from '@/features/analytics/pages/AnalyticsPage';
import BrokerPage from '@/features/broker/pages/BrokerPage';
import SettingsPage from '@/features/settings/pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
      </Route>

      {/* Protected dashboard routes */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/orders" element={<OrderPage />} />
        <Route path="/paper-trading" element={<PaperTradingPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/broker" element={<BrokerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
