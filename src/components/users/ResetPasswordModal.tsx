// src/components/users/ResetPasswordModal.tsx
import { useState } from 'react';
import { 
  XMarkIcon, 
  ExclamationTriangleIcon, 
  ClipboardDocumentIcon,
  CheckIcon,
  KeyIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { User } from '../../graphql/userManagement';
// Note: In a real implementation, you would call a Cognito Admin API 
// through a Lambda function to reset the password

interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
}

export const ResetPasswordModal = ({ user, onClose }: ResetPasswordModalProps) => {
  const [mode, setMode] = useState<'choose' | 'generate' | 'email'>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  const generateRandomPassword = (): string => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    // Fill the rest
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleGeneratePassword = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const newPassword = generateRandomPassword();
      
      // In a real implementation, you would call:
      // await client.graphql({
      //   query: adminResetPasswordMutation,
      //   variables: { 
      //     input: { 
      //       userId: user.id, 
      //       temporaryPassword: newPassword 
      //     } 
      //   }
      // });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setGeneratedPassword(newPassword);
      setMode('generate');
    } catch (err: any) {
      console.error('Error resetting password:', err);
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // In a real implementation, you would call Cognito's 
      // adminResetUserPassword which sends a reset email
      // await client.graphql({
      //   query: adminResetPasswordMutation,
      //   variables: { 
      //     input: { 
      //       userId: user.id, 
      //       sendEmail: true 
      //     } 
      //   }
      // });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSuccess(true);
      setMode('email');
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* User Info */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                Resetting password for:
              </p>
              <p className="font-medium text-gray-900">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}` 
                  : user.username}
              </p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {mode === 'choose' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  Choose how to reset this user's password:
                </p>
                
                <button
                  onClick={handleGeneratePassword}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                >
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <KeyIcon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Generate Temporary Password</p>
                    <p className="text-sm text-gray-500">Create a password to share with the user</p>
                  </div>
                </button>

                <button
                  onClick={handleSendResetEmail}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                >
                  <div className="p-2 bg-green-100 rounded-lg">
                    <EnvelopeIcon className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Send Reset Email</p>
                    <p className="text-sm text-gray-500">User will receive an email with reset link</p>
                  </div>
                </button>

                {loading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                    <span className="ml-2 text-gray-600">Processing...</span>
                  </div>
                )}
              </div>
            )}

            {mode === 'generate' && generatedPassword && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckIcon className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-800">Password Reset Successful</span>
                  </div>
                  <p className="text-sm text-green-700">
                    The user's password has been reset. Share the temporary password below with them.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temporary Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedPassword}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-sm"
                    />
                    <button
                      onClick={copyToClipboard}
                      className={`px-3 py-2 rounded-lg border transition-colors ${
                        copied
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {copied ? (
                        <CheckIcon className="h-5 w-5" />
                      ) : (
                        <ClipboardDocumentIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>Important:</strong> The user will be required to change this password on their next login.
                  </p>
                </div>
              </div>
            )}

            {mode === 'email' && success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-green-800">Reset Email Sent</span>
                </div>
                <p className="text-sm text-green-700">
                  A password reset email has been sent to <strong>{user.email}</strong>.
                  The link will expire in 24 hours.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t">
            {mode !== 'choose' && (
              <button
                onClick={() => {
                  setMode('choose');
                  setGeneratedPassword(null);
                  setSuccess(false);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              {mode === 'choose' ? 'Cancel' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};