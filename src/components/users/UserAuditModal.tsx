// src/components/users/UserAuditModal.tsx
import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/api';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { User } from '../../graphql/userManagement';

// You'll need to generate this query in your API.ts
const listUserAuditLogs = /* GraphQL */ `
  query ListUserAuditLogs($filter: ModelUserAuditLogFilterInput, $limit: Int) {
    listUserAuditLogs(filter: $filter, limit: $limit) {
      items {
        id
        action
        resource
        createdAt
        details
      }
    }
  }
`;

interface Props {
  user: User;
  onClose: () => void;
}

export const UserAuditModal = ({ user, onClose }: Props) => {
  const [logs, setLogs] = useState<any[]>([]);
  const client = generateClient();

  useEffect(() => {
    const fetchLogs = async () => {
      const res = await client.graphql({
        query: listUserAuditLogs,
        variables: {
          filter: { userId: { eq: user.id } },
          limit: 50 // Get last 50 actions
        }
      });
      // @ts-ignore
      const items = res.data.listUserAuditLogs.items;
      // Sort client-side if your GSI isn't sorting by default
      setLogs(items.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    };
    fetchLogs();
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Audit Log: {user.username}</h2>
          <button onClick={onClose}><XMarkIcon className="h-6 w-6 text-gray-500" /></button>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.resource}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};