// src/pages/legal/TermsOfService.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, MapPin, Scale, Shield, AlertTriangle } from 'lucide-react';

// ============================================
// CONFIGURATION - Update these values
// ============================================
const effectiveDate = 'January 1, 2025';
const contactEmail = 'legal@pokerprolive.com';
const businessName = 'New Modo Pty Ltd';
const businessACN = 'ACN 17 619 035 004';
const businessAddress = 'Sydney, NSW, Australia';
const appName = 'PokerPro Live';

export const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <Link 
            to="/" 
            className="inline-flex items-center text-indigo-200 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {appName}
          </Link>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
              <Scale className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Terms of Service</h1>
              <p className="text-indigo-200 mt-1">{appName}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 text-sm text-indigo-200 mt-6">
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              Effective: {effectiveDate}
            </span>
            <span className="flex items-center gap-1">
              <Shield className="w-4 h-4" />
              {businessName} ({businessACN})
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Introduction */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
          <p className="text-gray-700 leading-relaxed">
            By accessing or using {appName}, you ("you", "user", or "visitor") agree to be bound by these 
            Terms of Service. If you do not agree, you must stop using the Service immediately.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                1
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Acceptance of Terms</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>These Terms govern your access to and use of {appName}, including:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Tournament tracking and reporting features</li>
                <li>Social-pulse feed generated from publicly available sources</li>
                <li>User accounts, analytics tools, and other functionality</li>
              </ul>
              <p className="mt-4">By using the Service, you confirm that:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>You are at least 18 years old or the age of legal majority in your jurisdiction</li>
                <li>You have read and understood these Terms</li>
                <li>You agree to comply with them</li>
              </ul>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                2
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Description of the Service</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>{appName} provides:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Tournament data reporting and analytics</li>
                <li>Player and session tracking tools</li>
                <li>A public social feed highlighting poker-related updates from publicly accessible Facebook pages and other sources</li>
                <li>Tools and features for poker venues, event organisers, and players</li>
              </ul>
              <p className="mt-4 text-gray-600">
                We may update, modify, or enhance the Service at any time, with or without notice.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                3
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Account Registration</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>Some features require you to create an account.</p>
              <p className="mt-4">When registering:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>You must provide accurate, current, and complete information</li>
                <li>You must keep your login credentials secure</li>
                <li>You are responsible for any activity on your account</li>
                <li>You must notify us immediately of any unauthorised access</li>
              </ul>
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-amber-800 text-sm">
                  <strong>Note:</strong> We may suspend or terminate accounts at our discretion for breaches of these Terms.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                4
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Use of the Service</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>You agree to use the Service only for lawful purposes.</p>
              <p className="mt-4 font-medium text-gray-900">You must not:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Upload false, misleading, harmful, or unlawful content</li>
                <li>Attempt to scrape, extract, or reverse-engineer our proprietary data</li>
                <li>Attempt to bypass or exploit system vulnerabilities</li>
                <li>Use the Service for gambling, betting, or wagering</li>
                <li>Interfere with the operation of the Service</li>
                <li>Impersonate any person or entity</li>
              </ul>
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-800 text-sm">
                  <strong>Warning:</strong> We reserve the right to restrict or terminate your access if misuse is detected.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                5
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Public Social Pulse Feed & Scraped Data</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>{appName} aggregates publicly accessible data from:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Public Facebook pages</li>
                <li>Public event announcements</li>
                <li>Public social media posts</li>
                <li>Public web sources</li>
              </ul>
              <p className="mt-4 font-medium text-gray-900">You acknowledge and agree that:</p>
              <ol className="list-decimal pl-5 space-y-2 text-gray-600">
                <li>We only surface data already publicly visible at its source.</li>
                <li>We do not verify the accuracy of third-party content.</li>
                <li>Copyright and ownership of scraped content remain with the original authors/platforms.</li>
                <li>We may remove or modify any displayed content at our discretion.</li>
                <li>Any automated scraping is limited to public sources and done in good faith for informational purposes.</li>
              </ol>
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-blue-800 text-sm">
                  If you believe your public content has been used incorrectly, contact us and we will investigate promptly.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                6
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Tournament & Player Data</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>The Service may collect, generate, or display:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Tournament structures, results, payouts, and metadata</li>
                <li>Player performance metrics</li>
                <li>Reports generated from public or user-submitted data</li>
              </ul>
              <p className="mt-4 font-medium text-gray-900">You acknowledge that:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>We do not guarantee the accuracy or completeness of tournament results</li>
                <li>Historical records may depend on third-party submissions or public listings</li>
                <li>Analytical tools are provided for informational purposes only</li>
              </ul>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                7
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Intellectual Property</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>All content created by {businessName}, including:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Logos, branding, trademarks</li>
                <li>Code, architecture, and databases</li>
                <li>User interfaces and design assets</li>
                <li>Proprietary analytics and features</li>
                <li>Documentation and guides</li>
              </ul>
              <p className="mt-4 text-gray-600">
                ...is owned by {businessName} and protected under Australian and international IP law.
              </p>
              <p className="mt-4 text-gray-600">
                Users are granted a limited, non-exclusive, non-transferable license to access and use the Service as intended.
              </p>
              <p className="mt-4 font-medium text-gray-900">Users may not:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Copy, modify, distribute, or create derivative works</li>
                <li>Resell or sublicense any part of the Service</li>
                <li>Use our trademarks without written permission</li>
              </ul>
            </div>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                8
              </span>
              <h2 className="text-xl font-semibold text-gray-900">User Content</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>If you upload or submit content (e.g., tournament data, venue information, profile details):</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>You grant us a worldwide, royalty-free licence to use, display, store, and distribute that content for the purpose of operating the Service</li>
                <li>You represent that you own or have permission to submit that content</li>
                <li>You are responsible for any content you provide</li>
              </ul>
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-gray-700 text-sm">
                  We reserve the right to remove content that violates these Terms.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                9
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Third-Party Services & Links</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>The Service may include:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>External links</li>
                <li>Embedded content</li>
                <li>Connections to third-party services (e.g., Facebook, social media)</li>
              </ul>
              <p className="mt-4 text-gray-600">
                We do not control or endorse these third parties and are not responsible for their content, policies, or practices.
              </p>
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-amber-800 text-sm">
                  Your use of third-party sites is at your own risk.
                </p>
              </div>
            </div>
          </section>

          {/* Section 10 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                10
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Disclaimer of Warranties</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>
                To the fullest extent permitted by law, {appName} is provided <strong>"as is"</strong> and <strong>"as available"</strong>, without warranties of any kind.
              </p>
              <p className="mt-4 font-medium text-gray-900">We do not warrant that:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>The Service will be uninterrupted or error-free</li>
                <li>Data (including scraped content or tournament results) is accurate or complete</li>
                <li>The Service is free from viruses or harmful components</li>
                <li>Third-party data sources remain accessible or consistent</li>
              </ul>
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-800 text-sm">
                  Your use of the Service is at your own risk.
                </p>
              </div>
            </div>
          </section>

          {/* Section 11 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                11
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Limitation of Liability</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>To the maximum extent permitted by Australian law:</p>
              <p className="mt-4 text-gray-600">
                {businessName}, its directors, employees, and partners are <strong>not liable</strong> for:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Indirect, incidental, special, or consequential damages</li>
                <li>Loss of profits, data, use, or goodwill</li>
                <li>Errors in third-party content</li>
                <li>Harm resulting from use or inability to use the Service</li>
                <li>Downtime, outages, or data inaccuracies</li>
              </ul>
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <p className="text-indigo-800 text-sm">
                  <strong>Liability Cap:</strong> Our total aggregate liability to you will not exceed AUD $100 or the amount you paid us in the last 12 months (whichever is higher).
                </p>
              </div>
            </div>
          </section>

          {/* Section 12 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                12
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Indemnification</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>
                You agree to indemnify and hold harmless {businessName} from any claims, damages, liabilities, or expenses arising from:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Your use or misuse of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your content or data submissions</li>
                <li>Your infringement of third-party rights</li>
              </ul>
            </div>
          </section>

          {/* Section 13 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                13
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Termination</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>We may suspend or terminate your access at any time:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>For breach of these Terms</li>
                <li>For fraudulent or illegal activity</li>
                <li>If we discontinue the Service</li>
                <li>For any reason reasonably necessary to protect our platform</li>
              </ul>
              <p className="mt-4 font-medium text-gray-900">Upon termination:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Your right to use the Service ends immediately</li>
                <li>Some provisions (including IP ownership, disclaimers, liability limits, indemnification) will continue to apply</li>
              </ul>
            </div>
          </section>

          {/* Section 14 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                14
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Changes to the Terms</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>We may update these Terms from time to time.</p>
              <p className="mt-4 text-gray-600">
                If the changes are significant, we will provide notice (e.g., email, in-app message, banner).
              </p>
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-blue-800 text-sm">
                  Your continued use of the Service constitutes acceptance of the updated Terms.
                </p>
              </div>
            </div>
          </section>

          {/* Section 15 */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                15
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Governing Law</h2>
            </div>
            <div className="prose prose-gray max-w-none ml-12">
              <p>These Terms are governed by the laws of <strong>New South Wales, Australia</strong>.</p>
              <p className="mt-4 text-gray-600">
                You agree to submit to the exclusive jurisdiction of the courts of New South Wales.
              </p>
            </div>
          </section>

          {/* Section 16 - Contact */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start gap-4 mb-4">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-sm">
                16
              </span>
              <h2 className="text-xl font-semibold text-gray-900">Contact Information</h2>
            </div>
            <div className="ml-12">
              <p className="text-gray-600 mb-6">
                For questions, concerns, or disputes relating to these Terms:
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                  <Mail className="w-5 h-5 text-indigo-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email</p>
                    <a 
                      href={`mailto:${contactEmail}`}
                      className="text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      {contactEmail}
                    </a>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                  <MapPin className="w-5 h-5 text-indigo-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Address</p>
                    <p className="text-sm text-gray-600">{businessName}</p>
                    <p className="text-sm text-gray-600">{businessACN}</p>
                    <p className="text-sm text-gray-600">{businessAddress}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Related Links */}
        <div className="mt-12 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Related Documents</h3>
          <div className="flex flex-wrap gap-4">
            <Link 
              to="/privacy-policy"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Privacy Policy
            </Link>
            {/* Add more legal document links as needed */}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
          </p>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms-of-service" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsOfService;