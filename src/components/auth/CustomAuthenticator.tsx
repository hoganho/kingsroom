// src/components/auth/CustomAuthenticator.tsx
import { Authenticator, View, Text, Heading } from '@aws-amplify/ui-react';
import { ReactNode } from 'react';

interface CustomAuthenticatorProps {
  children: ReactNode;
}

export const CustomAuthenticator = ({ children }: CustomAuthenticatorProps) => {
  const components = {
    Header() {
      return (
        <View textAlign="center" padding="2rem">
          <Heading level={3} style={{ color: '#4f46e5' }}>
            PokerPro Live
          </Heading>
          <Text color="neutral.60" marginTop="0.5rem">
            Tournament Management System
          </Text>
        </View>
      );
    },

    Footer() {
      return (
        <View textAlign="center" padding="1rem">
          <Text color="neutral.60" fontSize="0.875rem">
            &copy; {new Date().getFullYear()} PokerPro Live. All rights reserved.
          </Text>
        </View>
      );
    },

    SignIn: {
      Header() {
        return (
          <Heading 
            level={3} 
            padding="1rem 0" 
            textAlign="center"
            style={{ color: '#1f2937' }}
          >
            Sign in to your account
          </Heading>
        );
      },
      Footer() {
        return (
          <View textAlign="center" padding="1rem 0">
            <Text color="neutral.60" fontSize="0.875rem">
              Don't have an account?{' '}
              <Text as="span" color="brand.primary.80" fontWeight="600">
                Contact your administrator
              </Text>
            </Text>
          </View>
        );
      },
    },

    SignUp: {
      Header() {
        return (
          <Heading 
            level={3} 
            padding="1rem 0" 
            textAlign="center"
            style={{ color: '#1f2937' }}
          >
            Create a new account
          </Heading>
        );
      },
      Footer() {
        return (
          <View textAlign="center" padding="1rem 0">
            <Text color="neutral.60" fontSize="0.875rem">
              Already have an account?
            </Text>
          </View>
        );
      },
    },

    ConfirmSignIn: {
      Header() {
        return (
          <Heading 
            level={3} 
            padding="1rem 0" 
            textAlign="center"
            style={{ color: '#1f2937' }}
          >
            Confirm Sign In
          </Heading>
        );
      },
    },

    ResetPassword: {
      Header() {
        return (
          <Heading 
            level={3} 
            padding="1rem 0" 
            textAlign="center"
            style={{ color: '#1f2937' }}
          >
            Reset your password
          </Heading>
        );
      },
    },

    ConfirmResetPassword: {
      Header() {
        return (
          <Heading 
            level={3} 
            padding="1rem 0" 
            textAlign="center"
            style={{ color: '#1f2937' }}
          >
            Enter your new password
          </Heading>
        );
      },
    },
  };

  const formFields = {
    signIn: {
      username: {
        placeholder: 'Enter your email',
        label: 'Email Address',
        isRequired: true,
      },
      password: {
        placeholder: 'Enter your password',
        label: 'Password',
        isRequired: true,
      },
    },
    signUp: {
      username: {
        placeholder: 'Enter your email',
        label: 'Email Address',
        isRequired: true,
        order: 1,
      },
      email: {
        placeholder: 'Enter your email',
        label: 'Email Address',
        isRequired: true,
        order: 2,
      },
      password: {
        placeholder: 'Enter your password',
        label: 'Password',
        isRequired: true,
        order: 3,
      },
      confirm_password: {
        placeholder: 'Confirm your password',
        label: 'Confirm Password',
        isRequired: true,
        order: 4,
      },
    },
    resetPassword: {
      username: {
        placeholder: 'Enter your email',
        label: 'Email Address',
      },
    },
    confirmResetPassword: {
      confirmation_code: {
        placeholder: 'Enter your confirmation code',
        label: 'Confirmation Code',
      },
      password: {
        placeholder: 'Enter your new password',
        label: 'New Password',
      },
      confirm_password: {
        placeholder: 'Confirm your new password',
        label: 'Confirm Password',
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Authenticator
        components={components}
        formFields={formFields}
        hideSignUp={true} // Set to true if you want to hide sign up
      >
        {children}
      </Authenticator>
    </div>
  );
};
