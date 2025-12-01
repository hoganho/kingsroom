// src/hooks/useActivityLogger.ts
import { generateClient } from 'aws-amplify/api';
import { createUserAuditLog } from '../graphql/mutations';
import { useAuth } from '../contexts/AuthContext';

export const useActivityLogger = () => {
  const client = generateClient();
  const { user } = useAuth();

  const logActivity = async (
    action: string, 
    resource?: string, 
    details?: object
  ) => {
    if (!user?.id) return;

    try {
      // 1. Create the Audit Log Entry
      await client.graphql({
        query: createUserAuditLog,
        variables: {
          input: {
            userId: user.id,
            action,
            resource,
            details: details ? JSON.stringify(details) : null,
            userAgent: navigator.userAgent,
          }
        }
      });

    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't block the UI if logging fails
    }
  };

  return { logActivity };
};