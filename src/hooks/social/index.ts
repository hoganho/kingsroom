// src/hooks/social/index.ts
// Export all social-related hooks for easy importing

export { useSocialAccounts } from '../useSocialAccounts';
export type { 
  SocialAccount, 
  CreateSocialAccountInput, 
  UpdateSocialAccountInput 
} from '../useSocialAccounts';

export { useSocialPosts } from '../useSocialPosts';
export type { 
  SocialPost, 
  UpdateSocialPostInput 
} from '../useSocialPosts';
