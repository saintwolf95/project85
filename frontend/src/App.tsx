import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Intelligence } from './pages/Intelligence';
import { DemandForecasting } from './pages/DemandForecasting';
import { ActionableInsights } from './pages/ActionableInsights';
import { AiCopilot } from './pages/AiCopilot';
import { DataEngineering } from './pages/DataEngineering';
import { DataImportGuide } from './pages/DataImportGuide';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="inventory" element={<Intelligence />} />
            <Route path="forecast" element={<DemandForecasting />} />
            <Route path="alerts" element={<ActionableInsights />} />
            <Route path="copilot" element={<AiCopilot />} />
            <Route path="integrations" element={<DataEngineering />} />
            <Route path="import-guide" element={<DataImportGuide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
