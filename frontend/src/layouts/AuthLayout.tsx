import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand-400">fffffff</h1>
          <p className="mt-1 text-sm text-gray-500">Asset & Recommendation Platform</p>
        </div>
        <div className="card">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
