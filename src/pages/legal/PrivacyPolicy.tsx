// src/pages/legal/PrivacyPolicy.tsx
import React from 'react';
import { Shield, Mail, MapPin, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy: React.FC = () => {
  const effectiveDate = 'January 1, 2025'; // Update this when publishing
  const contactEmail = 'privacy@pokerprolive.com'; // Update with actual email
  const businessName = 'PokerPro Live';
  const businessAddress = 'Sydney, NSW, Australia'; // Update with actual address

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            to="/home"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Privacy Policy</h1>
              <p className="text-indigo-200 mt-1">Effective Date: {effectiveDate}</p>
            </div>
          </div>
          <p className="text-lg text-indigo-100 max-w-2xl mt-4">
            This Privacy Policy describes how {businessName} collects, uses, stores, and discloses information when you use our services.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-slate prose-lg max-w-none">
          {/* Introduction */}
          <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-xl mb-8">
            <p className="text-slate-700 m-0">
              We are committed to protecting your privacy and ensuring transparency about our data practices.
              By accessing or using the Service, you agree to the terms outlined in this Privacy Policy.
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">1</span>
              Information We Collect
            </h2>
            
            <p>We collect the following categories of information:</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">1.1. Information You Provide to Us</h3>
            
            <h4 className="text-lg font-semibold text-slate-700 mt-4 mb-2">Account Information (Registered Users Only)</h4>
            <p>If you create an account, we may collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Name or username</li>
              <li>Email address</li>
              <li>Password</li>
              <li>Optional profile information you choose to provide</li>
            </ul>

            <h4 className="text-lg font-semibold text-slate-700 mt-4 mb-2">Communications</h4>
            <p>If you contact us directly, we may collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Email address</li>
              <li>Messages, attachments, or metadata</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">1.2. Information We Collect Automatically</h3>
            
            <h4 className="text-lg font-semibold text-slate-700 mt-4 mb-2">Usage & Device Information</h4>
            <p>When you access the Service, we may automatically collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>IP address</li>
              <li>Device type and operating system</li>
              <li>Browser type</li>
              <li>Pages viewed, time on site, clicks, navigation events</li>
              <li>Access timestamps</li>
            </ul>

            <h4 className="text-lg font-semibold text-slate-700 mt-4 mb-2">Cookies & Tracking Technologies</h4>
            <p>We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Maintain user sessions</li>
              <li>Remember preferences</li>
              <li>Analyze traffic</li>
              <li>Improve functionality</li>
            </ul>
            <p className="text-sm text-slate-500 mt-2">You can manage cookie preferences through your browser settings.</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">1.3. Public Data Collection (Social Pulse Feed)</h3>
            <p>Our application aggregates publicly available content from:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Public Facebook Pages</li>
              <li>Other publicly accessible social media posts or websites (as applicable)</li>
            </ul>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
              <p className="text-slate-700 font-medium mb-2">We do not collect any personal information that:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Is not already publicly visible</li>
                <li>Comes from private Facebook profiles or private groups</li>
                <li>Requires authentication to access</li>
              </ul>
            </div>

            <p className="mt-4">Scraped content may include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Public posts</li>
              <li>Photos or promotional graphics</li>
              <li>Event announcements</li>
              <li>Page names</li>
              <li>Public comments (if included in the public post)</li>
            </ul>
            <p className="text-slate-600 mt-2 italic">This information is used solely to provide a consolidated social-pulse feed for users.</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">1.4. Tournament & Event Data</h3>
            <p>We collect tournament and poker-related information from:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Direct submissions by venues or users</li>
              <li>Public sources</li>
              <li>Our internal tools</li>
            </ul>

            <p className="mt-4">Collected data includes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Tournament names</li>
              <li>Buy-ins, structures, time stamps</li>
              <li>Results data (prize payouts, entries, finishers)</li>
              <li>Venue information</li>
            </ul>
            <p className="text-slate-600 mt-2 italic">This data is used for analytics, reporting, and historical tracking.</p>
          </section>

          {/* Section 2 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">2</span>
              How We Use Your Information
            </h2>
            <p>We use collected data to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Display tournament analytics, results, and reporting</li>
              <li>Generate and display the poker social-pulse feed</li>
              <li>Personalise the user experience</li>
              <li>Prevent fraud or misuse</li>
              <li>Improve stability and performance</li>
              <li>Communicate with you (support, account notices, updates)</li>
              <li>Comply with legal obligations</li>
            </ul>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4">
              <p className="text-emerald-800 font-semibold m-0">We do not sell your personal information.</p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">3</span>
              Legal Bases for Processing
            </h2>
            <p>If you reside in a jurisdiction requiring a legal basis (e.g., EU/EEA), we process your information under the following bases:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Contractual necessity</strong> — to provide the Service</li>
              <li><strong>Legitimate interest</strong> — analytics, security, public content aggregation</li>
              <li><strong>Consent</strong> — cookies, optional features</li>
              <li><strong>Compliance with legal obligations</strong></li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">4</span>
              Sharing & Disclosure of Information
            </h2>
            <p>We may share information in the following circumstances:</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">4.1. Service Providers</h3>
            <p>With trusted service providers that assist with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Hosting & infrastructure</li>
              <li>Analytics</li>
              <li>Security</li>
              <li>Email delivery</li>
              <li>Data storage</li>
            </ul>
            <p className="text-slate-600 mt-2 italic">They are contractually obligated to protect your data.</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">4.2. Public Social Content</h3>
            <p>Scraped public data may be displayed to all users of the Service.</p>
            <p className="text-slate-600 italic">We do not modify, republish, or create misleading representations of the scraped content.</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">4.3. Business Transfers</h3>
            <p>In the event of a merger, acquisition, or asset sale, your information may be transferred to the acquiring entity.</p>

            <h3 className="text-xl font-semibold text-slate-700 mt-6 mb-3">4.4. Legal Compliance</h3>
            <p>We may disclose information if required to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Comply with laws</li>
              <li>Respond to law enforcement or legal requests</li>
              <li>Protect our rights or the rights of others</li>
              <li>Prevent fraud, abuse, or security threats</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">5</span>
              Data Retention
            </h2>
            <p>We retain your information only as long as necessary to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide the Service</li>
              <li>Fulfil legal obligations</li>
              <li>Resolve disputes</li>
              <li>Enforce our agreements</li>
            </ul>
            <p className="mt-4">You may request deletion of your account at any time.</p>
            <p className="text-slate-600 mt-2 italic">Publicly sourced data may be cached in our system for performance purposes, but we periodically refresh content to ensure accuracy.</p>
          </section>

          {/* Section 6 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">6</span>
              Data Security
            </h2>
            <p>We use industry-standard administrative, technical, and physical safeguards to protect your information.</p>
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mt-4">
              <p className="text-slate-700 m-0">However, no method of transmission or storage is 100% secure. You use the Service at your own risk.</p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">7</span>
              Your Rights & Choices
            </h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the information we hold about you</li>
              <li>Request correction or deletion</li>
              <li>Request export of your data</li>
              <li>Restrict or object to processing</li>
              <li>Withdraw consent (where applicable)</li>
            </ul>
            <p className="mt-4">To exercise these rights, contact us at: <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:text-indigo-700">{contactEmail}</a></p>
          </section>

          {/* Section 8 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">8</span>
              Children's Privacy
            </h2>
            <p>The Service is not intended for children under 13 (or under the relevant age of digital consent in your region).</p>
            <p className="mt-2">We do not knowingly collect personal information from children. If you believe a child has provided data, contact us to have it removed.</p>
          </section>

          {/* Section 9 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">9</span>
              Third-Party Links
            </h2>
            <p>Our Service may contain links to third-party websites. We are not responsible for their privacy practices or content.</p>
          </section>

          {/* Section 10 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">10</span>
              International Data Transfers
            </h2>
            <p>If you are located outside the country where our servers are hosted, your data may be transferred internationally. We ensure such transfers comply with relevant legal requirements.</p>
          </section>

          {/* Section 11 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">11</span>
              Changes to This Privacy Policy
            </h2>
            <p>We may update this Privacy Policy from time to time. When updated, the "Effective Date" will be revised. Significant changes may be communicated through email or in-app notices.</p>
          </section>

          {/* Section 12 - Contact */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">12</span>
              Contact Us
            </h2>
            <p>If you have questions about this Privacy Policy or our data practices, please contact:</p>
            
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 mt-4">
              <h3 className="text-lg font-bold text-slate-800 mb-4">{businessName}</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Mail className="w-5 h-5 text-indigo-600" />
                  </div>
                  <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:text-indigo-700 font-medium">
                    {contactEmail}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <MapPin className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-slate-700">{businessAddress}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm">
            © {new Date().getFullYear()} {businessName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;