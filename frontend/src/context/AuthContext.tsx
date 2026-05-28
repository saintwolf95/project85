import { createContext, useContext, useState } from 'react';

interface AuthContextType {
  token: string | null;
  rol: string | null;
  login: (token: string, rol: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [rol, setRol] = useState<string | null>(localStorage.getItem('rol'));

  const login = (newToken: string, newRol: string) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('rol', newRol);
    setToken(newToken);
    setRol(newRol);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    setToken(null);
    setRol(null);
  };

  return (
    <AuthContext.Provider value={{ token, rol, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
