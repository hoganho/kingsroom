import { AmplifyAuthCognitoStackTemplate } from '@aws-amplify/cli-extensibility-helper';

export function override(resources: AmplifyAuthCognitoStackTemplate) {
  // Add S3 permissions for social post attachments upload
  // The authRoleArn parameter is: arn:aws:iam::ACCOUNT:role/ROLE_NAME
  // We need to extract just the role name for the IAM::Policy Roles property
  
  resources.addCfnResource({
    type: 'AWS::IAM::Policy',
    properties: {
      PolicyName: 'SocialPostAttachmentsS3Policy',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              's3:PutObject',
              's3:GetObject',
              's3:DeleteObject'
            ],
            Resource: [
              'arn:aws:s3:::pokerpro-scraper-storage/social-media/post-attachments/*',
              'arn:aws:s3:::kingsroom-storage-prod/social-media/post-attachments/*'
            ]
          },
          {
            Effect: 'Allow',
            Action: [
              's3:GetObject'
            ],
            Resource: [
              'arn:aws:s3:::pokerpro-scraper-storage/entities/*/html/*',
              'arn:aws:s3:::kingsroom-storage-prod/social-media/post-attachments/*'
            ]
          }
        ]
      },
      Roles: [
        {
          // Extract role name from ARN: arn:aws:iam::123456789:role/role-name
          // Split by ':' to get 'role/role-name', then split by '/' to get 'role-name'
          'Fn::Select': [
            1,
            {
              'Fn::Split': [
                '/',
                {
                  'Fn::Select': [
                    5,
                    {
                      'Fn::Split': [
                        ':',
                        { 'Ref': 'authRoleArn' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }, 'SocialPostS3Policy');
}