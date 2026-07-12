'use client';

import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="container legal-page">
      <div className="legal-header">
        <h1 className="font-mono text-brand">Privacy Policy</h1>
        <p className="legal-updated">Effective Date: July 12, 2026 &nbsp;|&nbsp; Last Updated: July 12, 2026</p>
      </div>

      <div className="legal-content font-mono">

        <section>
          <h2>1. Introduction</h2>
          <p>
            This Privacy Policy describes how BondFactor (&quot;BondFactor,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, stores, protects, and shares your personal information when you access or use the BondFactor fixed income analytics platform, including our website, application programming interfaces, and related services (collectively, the &quot;Platform&quot;).
          </p>
          <p>
            By accessing or using the Platform, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy. If you do not agree, please do not access or use the Platform.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <p>We collect information from the following categories of sources:</p>

          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Data:</strong> Email address, display name, and authentication credentials when you create an account or sign in via Google OAuth.</li>
            <li><strong>Portfolio Data:</strong> Security holdings, face values, and portfolio configurations that you enter into the Platform for analysis.</li>
            <li><strong>Scenario Parameters:</strong> Yield curve shock parameters, custom scenario configurations, and saved analysis states.</li>
            <li><strong>Communications:</strong> Any information you provide when contacting us for support or providing feedback.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Features accessed, actions performed, session duration, API call logs, and error logs.</li>
            <li><strong>Device Data:</strong> Browser type and version, operating system, device type, screen resolution, and language settings.</li>
            <li><strong>Network Data:</strong> IP address, referring URL, pages visited, and timestamps of access.</li>
          </ul>

          <h3>2.3 Information from Third Parties</h3>
          <ul>
            <li><strong>Authentication Providers:</strong> When you sign in via Google, we receive your email address, display name, and profile identifier from Google in accordance with their privacy policy.</li>
            <li><strong>Market Data:</strong> Yield curve parameters and benchmark data sourced from publicly available repositories. This data does not contain any personal information.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We process personal data for the following purposes and on the following legal bases:</p>
          <ul>
            <li><strong>Service Delivery (Contractual Necessity):</strong> To provide, maintain, and operate the Platform, including yield curve calculations, risk analytics, portfolio analysis, and report generation.</li>
            <li><strong>Account Management (Contractual Necessity):</strong> To create and manage your account, authenticate your identity, and provide customer support.</li>
            <li><strong>Service Improvement (Legitimate Interest):</strong> To analyze usage patterns, diagnose technical issues, and improve the Platform&apos;s functionality, performance, and user experience.</li>
            <li><strong>Security (Legitimate Interest):</strong> To detect, prevent, and respond to fraud, unauthorized access, and other harmful activity.</li>
            <li><strong>Legal Compliance (Legal Obligation):</strong> To comply with applicable laws, regulations, and legal processes.</li>
            <li><strong>Communications (Consent):</strong> To send you service-related notifications, product updates, and, with your consent, marketing communications. You may opt out of marketing communications at any time.</li>
          </ul>
        </section>

        <section>
          <h2>4. Cookies and Tracking Technologies</h2>
          <p>We use the following types of cookies and similar technologies:</p>
          <ul>
            <li><strong>Essential Cookies:</strong> Required for the Platform to function, including authentication session tokens and security cookies. These cannot be disabled.</li>
            <li><strong>Functional Cookies:</strong> Remember your preferences, such as language settings and UI state, to provide a personalized experience.</li>
            <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Platform, which features are most used, and where performance issues occur.</li>
          </ul>
          <p>
            You can manage cookie preferences through your browser settings. Disabling essential cookies may impair the Platform&apos;s functionality.
          </p>
        </section>

        <section>
          <h2>5. How We Share Your Information</h2>
          <p>We do not sell your personal information. We share data only in the following limited circumstances:</p>
          <ul>
            <li><strong>Service Providers:</strong> We use authorized third-party providers for cloud infrastructure (Vercel, Render), database hosting (Supabase), and authentication (Google). These providers access data solely to perform services on our behalf and are bound by contractual obligations to protect your information.</li>
            <li><strong>Legal Requirements:</strong> We may disclose information if required by law, regulation, legal process, or governmental request, or when we believe disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
            <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your personal information may be transferred as part of that transaction. We will notify you of any change in ownership or use of your personal information.</li>
            <li><strong>With Your Consent:</strong> We may share information for purposes not described in this policy only with your explicit consent.</li>
          </ul>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>We retain your personal information only for as long as necessary to fulfill the purposes described in this policy:</p>
          <ul>
            <li><strong>Account Data:</strong> Retained for the duration of your account. Deleted within 30 days of account closure.</li>
            <li><strong>Portfolio and Scenario Data:</strong> Retained while your account is active and deleted within 30 days of account closure.</li>
            <li><strong>Usage and Log Data:</strong> Retained for up to 24 months for analytics and security purposes.</li>
            <li><strong>Billing Records:</strong> Retained for 7 years where applicable, in accordance with financial regulatory requirements.</li>
            <li><strong>Backup Data:</strong> Removed within 90 days of the deletion of the source data.</li>
          </ul>
        </section>

        <section>
          <h2>7. Data Security</h2>
          <p>
            We maintain physical, electronic, and procedural safeguards designed to protect your personal information. These measures include encrypted data transmission (TLS/SSL), encrypted data storage, access controls limited to authorized personnel, intrusion detection systems, and regular security assessments. While we implement industry-standard security measures, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>8. International Data Transfers</h2>
          <p>
            Your information may be transferred to, stored, and processed in countries other than your country of residence, including the United States and India, where our service providers operate. These countries may have data protection laws that differ from those of your jurisdiction. We ensure that appropriate safeguards are in place for international transfers, including contractual protections with our service providers.
          </p>
        </section>

        <section>
          <h2>9. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
            <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete personal information.</li>
            <li><strong>Erasure:</strong> Request deletion of your personal information, subject to applicable retention obligations.</li>
            <li><strong>Restriction:</strong> Request that we limit the processing of your personal information in certain circumstances.</li>
            <li><strong>Portability:</strong> Request a copy of your personal information in a structured, commonly used, and machine-readable format.</li>
            <li><strong>Objection:</strong> Object to our processing of your personal information based on legitimate interests.</li>
            <li><strong>Withdraw Consent:</strong> Where processing is based on consent, withdraw that consent at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at the address provided in Section 12. We will respond to your request within 30 days.
          </p>
        </section>

        <section>
          <h2>10. Children&apos;s Privacy</h2>
          <p>
            The Platform is not directed to individuals under the age of 18. We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to delete it promptly. If you believe we have collected information from a child under 18, please contact us immediately.
          </p>
        </section>

        <section>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the &quot;Effective Date&quot; above. Your continued use of the Platform after any changes constitutes acceptance of the updated policy. We encourage you to review this policy periodically.
          </p>
        </section>

        <section>
          <h2>12. Contact Us</h2>
          <p>
            If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
          </p>
          <p className="legal-contact">
            BondFactor<br />
            Email: privacy@bondfactor.in<br />
          </p>
        </section>

      </div>
    </div>
  );
}
