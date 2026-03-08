import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import toast from 'react-hot-toast';

export default function VerifyOtpPage() {
  const [otp, setOtp] = useState('');
  const { verifyOtp, isLoading } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const phone = (location.state as { phone?: string, userId: string })?.phone;
  const userId = (location.state as { phone?: string, userId: string })?.userId;
  console.log('Phone from state:', phone);
  console.log('User ID from state:', userId);

  if (!phone) {
    navigate('/register');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyOtp(phone, otp);
      toast.success('Account verified!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold">Verify OTP</h2>
      <p className="text-sm text-gray-500">
        Enter the 6-digit code sent to your phone.
      </p>

      <div>
        <label className="label">OTP Code</label>
        <input
          type="text"
          className="input text-center text-2xl tracking-[0.5em]"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          required
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={isLoading || otp.length !== 6}>
        {isLoading ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  );
}
