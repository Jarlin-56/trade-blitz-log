import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Landing from './Landing';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
  if (session) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}
