import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL ?? '/api'}`;

export interface AuthResponse {
  token: string;
  email: string;
  userId: string;
}

export const loginRequest = async (email: string, password: string): Promise<AuthResponse> => {
  const res = await axios.post<AuthResponse>(`${API}/auth/login`, { email, password });
  return res.data;
};

export const registerRequest = async (email: string, password: string): Promise<AuthResponse> => {
  const res = await axios.post<AuthResponse>(`${API}/auth/register`, { email, password });
  return res.data;
};
