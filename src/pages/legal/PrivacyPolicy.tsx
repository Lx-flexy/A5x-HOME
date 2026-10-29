import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, Home } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/settings" 
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 mb-4"
          >
            <ArrowLeft size={16} />
            Back to Settings
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
              <Shield size={24} className="text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
                A5X Home Privacy Policy
              </h1>
              <p className="text-sm text-neutral-500 mt-1">
                Effective Date: 21 October 2026 | Last Updated: 21 October 2026
              </p>
            </div>
          </div>
        </div>

        {/* Content Card */}
        <div 
          className="rounded-2xl p-6 sm:p-8 mb-8" 
          style={{ 
            background: 'var(--bg-primary)',
            boxShadow: 'var(--neo-shadow-lg)' 
          }}
        >
          <div className="prose prose-neutral max-w-none">
            {/* 1. Introduction */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                1. Introduction
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home is a smart home automation platform operated by A5X Industries Private Limited ("A5X", "we", "our", or "us").
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                This Privacy Policy explains how we collect, use, store, disclose, and protect personal data when you use A5X Home, our website, applications, compatible IoT devices, and supported third-party integrations.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                We aim to process personal data transparently and only for legitimate purposes associated with operating and supporting our services. Where required by applicable law, we will obtain consent before processing personal data.
              </p>
            </section>

            {/* 2. Company Information */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                2. Company Information
              </h2>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                <p className="text-neutral-700"><strong>Legal Name:</strong> A5X Industries Private Limited</p>
                <p className="text-neutral-700"><strong>CIN:</strong> U62099MP2026PTC084577</p>
                <p className="text-neutral-700"><strong>GSTIN:</strong> 23ABFCA8642R1Z4</p>
                <p className="text-neutral-700"><strong>Registered Office:</strong> 270a, New Rajiv Gandhi Ward, Trimurti Nagar, Vijay Nagar Colony, Jabalpur, Madhya Pradesh 482002, India</p>
                <p className="text-neutral-700"><strong>Website:</strong> <a href="https://a5x.in" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">https://a5x.in</a></p>
                <p className="text-neutral-700"><strong>Service:</strong> A5X Home</p>
                <p className="text-neutral-700"><strong>Email:</strong> <a href="mailto:support@a5x.in" className="text-primary-600 hover:underline">support@a5x.in</a></p>
                <p className="text-neutral-700"><strong>Phone:</strong> <a href="tel:+918269858259" className="text-primary-600 hover:underline">+91 82698 58259</a></p>
              </div>
            </section>

            {/* 3. Information We Collect */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                3. Information We Collect
              </h2>
              
              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                3.1 Account and Authentication Information
              </h3>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on how you register or sign in, we may collect:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Your name and email address</li>
                <li>Account identifiers and user IDs</li>
                <li>Authentication and account status information</li>
                <li>Information required to manage your account and permissions</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed mb-6">
                If you use a third-party sign-in provider, we may receive information that you authorize that provider to share with us.
              </p>

              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                3.2 Smart Device Information
              </h3>
              <p className="text-neutral-700 leading-relaxed mb-4">
                To provide device management and automation features, A5X Home may process:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Device IDs, names, types, and assigned rooms</li>
                <li>Appliance states, including ON/OFF status</li>
                <li>Device connectivity, online/offline status, and last-seen timestamps</li>
                <li>Device heartbeat and diagnostic information</li>
                <li>Available sensor readings, device runtime, and energy analytics</li>
                <li>Wi-Fi signal strength and device health information, where supported</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed mb-6">
                The information collected depends on the device, firmware, and features enabled.
              </p>

              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                3.3 Technical Information
              </h3>
              <p className="text-neutral-700 leading-relaxed">
                We may process technical logs, error reports, service requests, and diagnostic information necessary to maintain application functionality, investigate failures, and protect our services.
              </p>
            </section>

            {/* 4. How We Use Personal Data */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                4. How We Use Personal Data
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We may use personal data to:
              </p>
              <ol className="list-decimal list-inside text-neutral-700 space-y-2 mb-4">
                <li>Create and manage user accounts</li>
                <li>Authenticate users and manage account access</li>
                <li>Register and manage compatible IoT devices</li>
                <li>Execute authorized smart device control commands</li>
                <li>Display device status, runtime, and available analytics</li>
                <li>Enable supported third-party integrations</li>
                <li>Troubleshoot technical issues and improve service reliability</li>
                <li>Respond to customer support and privacy requests</li>
                <li>Protect the platform against unauthorized access and misuse</li>
                <li>Comply with applicable legal obligations</li>
              </ol>
              <p className="text-neutral-700 leading-relaxed">
                We will not process personal data for a materially different purpose without an appropriate legal basis and consent where required.
              </p>
            </section>

            {/* 5. Paid Services and Transactions */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                5. Paid Services and Transactions
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home may offer paid features, subscriptions, or associated products.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Where payments are supported, payment-related information may be processed by the relevant payment service provider. We will process only the information reasonably necessary to administer purchases, subscriptions, billing, refunds, and customer support.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                We do not claim to store complete payment card details unless the actual implementation does so.
              </p>
            </section>

            {/* 6. Third-Party Services and Data Sharing */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                6. Third-Party Services and Data Sharing
              </h2>
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
                <p className="text-sm text-green-800 font-semibold">
                  ✓ We do not sell personal data.
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We may share relevant information with service providers when necessary to operate the service, fulfill your requests, maintain security, or comply with law.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on the services actually deployed, providers may include:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li><strong>Google Firebase / Google Cloud:</strong> Authentication, databases, and related infrastructure</li>
                <li><strong>Vercel:</strong> Website hosting and application delivery</li>
                <li><strong>Supabase:</strong> Analytics or database functionality, if enabled</li>
                <li><strong>Google Home:</strong> Authorized smart device discovery, synchronization, and control</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                Only the providers and services actually used by A5X Home apply. Their processing is subject to their applicable privacy policies and contractual arrangements.
              </p>
            </section>

            {/* 7. Google Home Integration */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                7. Google Home Integration
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                If you choose to link A5X Home with Google Home, supported information may be exchanged with Google to enable authorized device discovery and control.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on the implemented integration, this may include device identifiers, names, room assignments, supported capabilities, and current device states through mechanisms such as SYNC, QUERY, and EXECUTE.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Google processes voice requests and related information under its own services and privacy policies. A5X does not claim to receive voice recordings or transcripts unless the specific integration actually provides them.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                You may unlink the integration through the relevant settings made available by Google or A5X. Unlinking may stop future access through the integration, but it does not automatically delete your A5X account or all data held by Google.
              </p>
            </section>

            {/* 8. Data Storage, Retention, and Deletion */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                8. Data Storage, Retention, and Deletion
              </h2>
              
              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                8.1 Retention Period
              </h3>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Our intended policy is to retain account-associated personal data while your A5X Home account remains active and to process deletion requests when your account is deleted.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-6">
                Deletion may not remove every record immediately. Some information may need to be retained where required or permitted by applicable law, for security, fraud prevention, dispute resolution, accounting, or other legitimate compliance purposes.
              </p>

              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                8.2 Account Deletion Requests
              </h3>
              <p className="text-neutral-700 leading-relaxed mb-4">
                To request account and associated personal data deletion, email:
              </p>
              <div className="bg-primary-50 rounded-lg p-4 mb-4">
                <p className="text-neutral-700 mb-2">
                  <strong>Email:</strong> <a href="mailto:support@a5x.in?subject=A5X%20Home%20—%20Account%20and%20Data%20Deletion%20Request" className="text-primary-600 hover:underline">support@a5x.in</a>
                </p>
                <p className="text-neutral-700">
                  <strong>Subject:</strong> "A5X Home — Account and Data Deletion Request"
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Please include the email address associated with your account. Do not send your password, authentication codes, or other secret credentials.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We may verify your identity before processing the request. We will handle it within the timeframe required by applicable law and explain any relevant limitations where necessary.
              </p>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Important:</strong> Deleting your A5X account may disable device controls, cloud functionality, and account linking.
                </p>
              </div>
            </section>

            {/* 9. Data Security */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                9. Data Security
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We use reasonable technical and organizational measures intended to protect personal data against unauthorized access, disclosure, alteration, loss, and misuse.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on the deployed implementation, these measures may include authentication, access restrictions, secure communication, and controlled administrative access.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                No internet-connected service can guarantee absolute security. We will handle security incidents and applicable notification obligations in accordance with the law.
              </p>
            </section>

            {/* 10. International Processing */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                10. International Processing
              </h2>
              <p className="text-neutral-700 leading-relaxed">
                Our service providers may process or store information in locations outside your state or country. International transfers will be handled in accordance with applicable Indian law and any relevant restrictions or safeguards.
              </p>
            </section>

            {/* 11. Your Rights and Choices */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                11. Your Rights and Choices
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Subject to applicable law, you may be entitled to request:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Access to personal data</li>
                <li>Correction of inaccurate information</li>
                <li>Deletion of personal data</li>
                <li>Withdrawal of consent where applicable</li>
                <li>Grievance redressal</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                You may contact us to exercise these rights. Requests may be subject to identity verification and lawful retention requirements.
              </p>
            </section>

            {/* 12. Children's Privacy and Minimum Age */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                12. Children's Privacy and Minimum Age
              </h2>
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                <p className="text-sm text-blue-800 font-semibold">
                  A5X Home is intended for individuals aged <strong>18 years or older</strong>.
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We do not knowingly permit individuals under 18 to create or use an account in violation of applicable law. If we become aware that an account has been created in breach of this requirement, we may restrict the account and review the associated data in accordance with applicable law.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                Where mandatory legal requirements concerning children's personal data apply, those requirements will take precedence over this general age policy.
              </p>
            </section>

            {/* 13. Changes to This Policy */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                13. Changes to This Policy
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We may update this Privacy Policy to reflect changes in our services, data practices, technology, or legal obligations.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                The revised policy will be published on our website with an updated revision date. Where required by law, we will provide appropriate notice or obtain consent.
              </p>
            </section>

            {/* 14. Contact and Grievance Redressal */}
            <section className="mb-8 p-4 bg-neutral-50 rounded-lg">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                14. Contact and Grievance Redressal
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                For privacy questions, access requests, correction, deletion, or complaints, contact:
              </p>
              <div className="text-neutral-700 space-y-2">
                <p><strong>A5X Industries Private Limited</strong></p>
                <p><strong>Website:</strong> <a href="https://a5x.in" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">https://a5x.in</a></p>
                <p><strong>Email:</strong> <a href="mailto:support@a5x.in" className="text-primary-600 hover:underline">support@a5x.in</a></p>
                <p><strong>Phone:</strong> <a href="tel:+918269858259" className="text-primary-600 hover:underline">+91 82698 58259</a></p>
                <p><strong>Address:</strong> 270a, New Rajiv Gandhi Ward, Trimurti Nagar, Vijay Nagar Colony, Jabalpur, Madhya Pradesh 482002, India</p>
              </div>
              <p className="text-neutral-700 leading-relaxed mt-4">
                We will review and respond to grievances in accordance with applicable legal requirements.
              </p>
            </section>

            {/* 15. Governing Law */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                15. Governing Law
              </h2>
              <p className="text-neutral-700 leading-relaxed">
                This Privacy Policy is intended to operate under the laws of India, including applicable data protection legislation and rules in force and applicable to the relevant processing.
              </p>
            </section>

            <div className="text-center text-sm text-neutral-500 pt-6 border-t border-neutral-200">
              <p className="font-semibold text-neutral-900 mb-2">End of Privacy Policy</p>
              <p>© 2026 A5X Industries Private Limited. All rights reserved.</p>
              <p className="mt-2">
                By using A5X Home, you acknowledge that you have read and understood this Privacy Policy.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/settings"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
            style={{ boxShadow: 'var(--neo-shadow)' }}
          >
            <ArrowLeft size={18} />
            Back to Settings
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
          >
            <Home size={18} />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
