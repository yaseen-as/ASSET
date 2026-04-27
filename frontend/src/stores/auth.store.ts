import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<{ userId: string, phoneNumber: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          set({
            accessToken: data.data.accessToken,
            user: data.data.user,
            isAuthenticated: true,
          });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (name, email, phone, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', { name, email, phone, password });
          return { userId: data.data.userId, phoneNumber: data.data.phone };
        } finally {
          set({ isLoading: false });
        }
      },

      verifyOtp: async (phone, otp) => {
        set({ isLoading: true });
        try {
          await api.post('/auth/verify-otp', { phone, otp });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        api.post('/auth/logout').catch(() => {});
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
