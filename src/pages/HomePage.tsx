import { useAuth } from '../contexts/AuthContext';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageCard } from '../components/layout/PageWrapper'; // Assuming PageCard is also exported

export const HomePage = () => {
  const { user, loading } = useAuth();

  const getGreeting = () => {
    if (loading) {
      return 'Loading user...';
    }
    if (user) {
      return `Hello, ${user.email}`;
    }
    return 'Hello, Guest';
  };

  return (
    <PageWrapper title="Home" maxWidth="7xl">
      <PageCard>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-gray-600">
            Welcome to the Kings Room admin dashboard.
          </p>
        </div>
      </PageCard>
    </PageWrapper>
  );
};