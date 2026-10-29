import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, Home } from 'lucide-react';

export default function TermsAndConditions() {
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
            <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center">
              <FileText size={24} className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
                A5X Home Terms of Service
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
            {/* 1. Introduction and Acceptance */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                1. Introduction and Acceptance
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                These Terms of Service ("Terms") govern your access to and use of A5X Home, operated by A5X Industries Private Limited ("A5X", "we", "our", or "us").
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                By registering for an account, purchasing an eligible service, or using A5X Home, you agree to these Terms and our Privacy Policy.
              </p>
              <p className="text-neutral-700 leading-relaxed font-semibold">
                If you do not agree with these Terms, do not use the service.
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
                <p className="text-neutral-700"><strong>Email:</strong> <a href="mailto:support@a5x.in" className="text-primary-600 hover:underline">support@a5x.in</a></p>
                <p className="text-neutral-700"><strong>Phone:</strong> <a href="tel:+918269858259" className="text-primary-600 hover:underline">+91 82698 58259</a></p>
              </div>
            </section>

            {/* 3. Description of Services */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                3. Description of Services
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home is a smart home automation platform designed to support compatible IoT devices and connected appliances.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on the features available to your account, the service may provide:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>User registration and authentication</li>
                <li>Smart device registration and management</li>
                <li>Appliance control and device status monitoring</li>
                <li>Device connectivity and available runtime or energy analytics</li>
                <li>Supported third-party integrations, including Google Home</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                The availability of individual features depends on the applicable hardware, firmware, account permissions, subscription, network connectivity, and third-party services. We do not guarantee that every feature will be available for every device or configuration.
              </p>
            </section>

            {/* 4. Eligibility and Account Security */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                4. Eligibility and Account Security
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home accounts are intended for individuals aged <strong>18 years or older</strong>.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You agree to:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Provide accurate registration information</li>
                <li>Protect your credentials and promptly notify us of suspected unauthorized account access</li>
                <li>Only register, access, or control devices that you own or are authorized to manage</li>
                <li>Maintain the security of your home network, compatible devices, and account credentials</li>
              </ul>
            </section>

            {/* 5. Paid Services and Billing */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                5. Paid Services and Billing
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home is intended to offer paid services. The price and commercial terms of a particular offering will be disclosed before you commit to a purchase.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Depending on the offering, charges may apply to subscriptions, premium features, hardware, installation, or related services.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                Before completing a transaction, review the displayed price, applicable taxes, billing frequency, subscription duration, renewal conditions, and any additional charges.
              </p>
            </section>

            {/* 6. Hardware Warranty */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                6. Hardware Warranty
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Where A5X supplies hardware with an express warranty, the standard warranty period is <strong>six months</strong>, subject to the applicable product documentation and warranty terms.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                The warranty does not automatically cover damage caused by:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Misuse or unauthorized modifications</li>
                <li>Incorrect wiring or improper installation</li>
                <li>Operation outside specified electrical ratings</li>
                <li>Unsuitable power supplies</li>
                <li>Liquid damage or physical damage</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                Any warranty exclusions remain subject to mandatory consumer protection and product liability requirements.
              </p>
            </section>

            {/* 7. Electrical Safety and Device Operation */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                7. Electrical Safety and Device Operation
              </h2>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Critical Safety Warning</p>
                <p className="text-sm text-yellow-700">
                  A5X Home may communicate with compatible electronic controllers, relay modules, sensors, and appliances. Device operation may be affected by network interruptions, power loss, hardware defects, or firmware errors.
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You must:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Follow the manufacturer's installation and operating instructions</li>
                <li>Use power supplies, relays, cables, and components rated for the intended application</li>
                <li>Ensure appropriate electrical protection and enclosure arrangements</li>
                <li>Use a qualified professional for installations involving mains electricity</li>
                <li>Maintain suitable independent safety mechanisms and manual overrides</li>
              </ul>
              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-700 font-semibold">
                  A5X Home must not be relied upon as the sole safety mechanism for fire protection, emergency response, medical equipment, or other life-critical applications.
                </p>
              </div>
            </section>

            {/* 8. Service Availability and Maintenance */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                8. Service Availability and Maintenance
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We aim to maintain a reliable service but do not guarantee uninterrupted availability or error-free operation.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                The service may be temporarily unavailable due to:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Maintenance or infrastructure failures</li>
                <li>Security incidents or internet connectivity issues</li>
                <li>Third-party service interruptions</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                We may update, modify, suspend, or discontinue features where reasonably necessary. Where practicable, we will provide notice of material changes.
              </p>
            </section>

            {/* 9. Intellectual Property */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                9. Intellectual Property
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Unless otherwise stated, A5X or its licensors own the intellectual property rights in A5X Home's original software, source code, interface, documentation, visual assets, logos, trademarks, and related materials.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You receive a limited, non-exclusive, non-transferable, revocable right to use the service for its intended purpose, subject to these Terms.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                You must not reproduce, redistribute, modify, reverse engineer, or commercially exploit protected materials except where permitted by law or authorized in writing.
              </p>
              <p className="text-neutral-700 leading-relaxed mt-4 font-medium">
                <strong>Copyright notice:</strong> © 2026 A5X Industries Private Limited. All rights reserved.
              </p>
            </section>

            {/* 10. Acceptable Use */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                10. Acceptable Use
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You must not:
              </p>
              <ul className="list-disc list-inside text-neutral-700 space-y-2 mb-4">
                <li>Access accounts or devices without authorization</li>
                <li>Circumvent authentication or security controls</li>
                <li>Interfere with the service or its infrastructure</li>
                <li>Use the platform for unlawful surveillance or unauthorized access</li>
                <li>Introduce malicious code or abuse APIs</li>
                <li>Use connected devices in ways that violate applicable law or create unreasonable safety risks</li>
              </ul>
              <p className="text-neutral-700 leading-relaxed">
                We may restrict or suspend access where reasonably necessary to address security risks, unlawful use, or material violations of these Terms.
              </p>
            </section>

            {/* 11. Third-Party Services */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                11. Third-Party Services
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                A5X Home may integrate with third-party providers, including Google Home and cloud hosting providers.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Third-party services may be subject to separate terms, privacy policies, technical requirements, and availability limitations.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                A5X does not control independent third-party services and is not responsible for their acts or omissions except where applicable law provides otherwise.
              </p>
            </section>

            {/* 12. Privacy and Data Deletion */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                12. Privacy and Data Deletion
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Your use of A5X Home is also governed by our <Link to="/privacy" className="text-primary-600 hover:underline font-medium">Privacy Policy</Link>.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You may request deletion of your account and associated personal data by contacting:
              </p>
              <div className="bg-primary-50 rounded-lg p-4">
                <p className="text-neutral-700">
                  <strong>Email:</strong> <a href="mailto:support@a5x.in?subject=A5X%20Home%20—%20Account%20and%20Data%20Deletion%20Request" className="text-primary-600 hover:underline">support@a5x.in</a>
                </p>
                <p className="text-neutral-700 mt-1">
                  <strong>Subject:</strong> "A5X Home — Account and Data Deletion Request"
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed mt-4">
                Account deletion may result in the loss of access to connected-device controls and cloud features.
              </p>
            </section>

            {/* 13. Limitation of Liability */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                13. Limitation of Liability
              </h2>
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <p className="text-sm text-red-700">
                  To the extent permitted by applicable law, A5X will not be liable for indirect or consequential losses arising from service interruption, third-party outages, internet failures, device incompatibility, or misuse of connected hardware.
                </p>
              </div>
              <p className="text-neutral-700 leading-relaxed">
                A5X does not exclude or limit liability where doing so would be unlawful, including applicable mandatory consumer rights, statutory remedies, or liability that cannot legally be excluded.
              </p>
            </section>

            {/* 14. Suspension and Termination */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                14. Suspension and Termination
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                You may stop using A5X Home at any time and may request account deletion using the published privacy contact.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                We may suspend or terminate access where reasonably necessary because of a material breach, security risk, unlawful activity, or service discontinuation, subject to applicable law and any required notice.
              </p>
            </section>

            {/* 15. Changes to These Terms */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                15. Changes to These Terms
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                We may revise these Terms to reflect changes in our service, business model, security requirements, or legal obligations.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                Updated Terms will be published on our website with a revised date. Where required by law, we will provide appropriate notice or obtain consent before applying material changes.
              </p>
            </section>

            {/* 16. Governing Law and Jurisdiction */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                16. Governing Law and Jurisdiction
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                These Terms are governed by the laws of India.
              </p>
              <p className="text-neutral-700 leading-relaxed mb-4">
                Subject to applicable law, courts of competent jurisdiction at <strong>Jabalpur, Madhya Pradesh</strong> are intended to have jurisdiction over disputes arising from these Terms.
              </p>
              <p className="text-neutral-700 leading-relaxed">
                Nothing in this section limits any consumer's right to approach a forum or authority that has jurisdiction under applicable law.
              </p>
            </section>

            {/* 17. Legal and Customer Support */}
            <section className="mb-8 p-4 bg-neutral-50 rounded-lg">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                17. Legal and Customer Support
              </h2>
              <p className="text-neutral-700 leading-relaxed mb-4">
                For questions regarding these Terms, subscriptions, payments, warranties, or legal matters, contact:
              </p>
              <div className="text-neutral-700 space-y-2">
                <p><strong>A5X Industries Private Limited</strong></p>
                <p><strong>Website:</strong> <a href="https://a5x.in" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">https://a5x.in</a></p>
                <p><strong>Email:</strong> <a href="mailto:support@a5x.in" className="text-primary-600 hover:underline">support@a5x.in</a></p>
                <p><strong>Phone:</strong> <a href="tel:+918269858259" className="text-primary-600 hover:underline">+91 82698 58259</a></p>
                <p><strong>Address:</strong> 270a, New Rajiv Gandhi Ward, Trimurti Nagar, Vijay Nagar Colony, Jabalpur, Madhya Pradesh 482002, India</p>
              </div>
              <p className="text-neutral-700 leading-relaxed mt-4">
                We will review and respond to complaints in accordance with applicable law.
              </p>
            </section>

            {/* 18. Severability */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                18. Severability
              </h2>
              <p className="text-neutral-700 leading-relaxed">
                If any provision of these Terms is found invalid or unenforceable, the remaining provisions will continue to apply to the extent legally permitted.
              </p>
            </section>

            {/* 19. Entire Agreement */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                19. Entire Agreement
              </h2>
              <p className="text-neutral-700 leading-relaxed">
                These Terms, together with the Privacy Policy and any applicable product, subscription, or warranty terms provided at purchase, govern your use of A5X Home, subject to mandatory applicable law.
              </p>
            </section>

            <div className="text-center text-sm text-neutral-500 pt-6 border-t border-neutral-200">
              <p className="font-semibold text-neutral-900 mb-2">End of Terms of Service</p>
              <p>© 2026 A5X Industries Private Limited. All rights reserved.</p>
              <p className="mt-2">
                By using A5X Home, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
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
