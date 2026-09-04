<script setup lang="ts">
useSeoMeta({
  title: 'Privacy Policy',
  description: 'Hookcrow privacy policy — what data we collect, how we use it, and your rights.',
  ogTitle: 'Privacy Policy · Hookcrow',
  ogDescription: 'Hookcrow privacy policy — what data we collect, how we use it, and your rights.',
  twitterTitle: 'Privacy Policy · Hookcrow',
  twitterDescription: 'Hookcrow privacy policy — what data we collect, how we use it, and your rights.'
})

useCanonical()
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 md:px-6 py-10 space-y-4">
    <h1 class="text-2xl font-bold">Privacy Policy</h1>
    <p class="text-sm text-dimmed">Last updated: April 21, 2026</p>

    <p class="text-muted leading-relaxed">
      This Privacy Policy explains what information Hookcrow ("we", "us") collects when you use the
      Hookcrow website and services (the "Service"), how we use it, and the choices you have. If
      you do not agree with this policy, please do not use the Service.
    </p>

    <h2 class="text-lg font-semibold mt-6">1. Information We Collect</h2>
    <p class="text-muted leading-relaxed">
      <strong class="text-default">Account information.</strong> When you register, we collect your
      email address and authentication credentials through our auth provider, Supabase.
    </p>
    <p class="text-muted leading-relaxed">
      <strong class="text-default">Uploaded content and derived data.</strong> Videos you upload,
      along with transcripts, segment metadata, and AI-generated analyses produced from them, are
      stored in our hosted database and object storage.
    </p>
    <p class="text-muted leading-relaxed">
      <strong class="text-default">Payment information.</strong> None. The Service is free and we do
      not collect or process payment details.
    </p>
    <p class="text-muted leading-relaxed">
      <strong class="text-default">Usage data.</strong> We log basic usage information (for
      example, timestamps, IP address, browser/device info, and the pages you visit) to keep the
      Service secure and to understand how it is used.
    </p>

    <h2 class="text-lg font-semibold mt-6">2. How We Use Information</h2>
    <p class="text-muted leading-relaxed">
      We use the information we collect to operate and improve the Service, process videos and
      generate analyses you request, authenticate you, communicate with you about updates or
      support, detect and prevent abuse, and comply with legal obligations.
    </p>

    <h2 class="text-lg font-semibold mt-6">3. Third-Party Services</h2>
    <p class="text-muted leading-relaxed">
      We rely on a small set of sub-processors to run the Service:
    </p>
    <ul class="list-disc pl-6 text-muted leading-relaxed space-y-1">
      <li><strong class="text-default">Supabase</strong> — database, authentication, and object storage.</li>
      <li><strong class="text-default">Google Gemini</strong> — AI analysis of uploaded videos (transcription, structure, audio, and visual analysis). Uploaded video content is transmitted to Gemini to generate analyses and may be retained temporarily according to Google's policies.</li>
    </ul>
    <p class="text-muted leading-relaxed">
      We do not sell your personal information.
    </p>

    <h2 class="text-lg font-semibold mt-6">4. Data Retention &amp; Deletion</h2>
    <p class="text-muted leading-relaxed">
      We retain your account data and uploaded content for as long as your account is active. You
      can delete individual videos at any time from the Service, and you can request deletion of
      your account by emailing
      <a href="mailto:support@hookcrow.com" class="text-primary hover:underline">support@hookcrow.com</a>.
      Some records may be retained for a limited period to satisfy legal, accounting, or security
      requirements.
    </p>

    <h2 class="text-lg font-semibold mt-6">5. Cookies &amp; Local Storage</h2>
    <p class="text-muted leading-relaxed">
      We use a small number of cookies and browser storage items to keep you signed in, remember
      your preferences, and gather anonymised analytics. You can control cookies through your
      browser settings; disabling them may affect parts of the Service.
    </p>

    <h2 class="text-lg font-semibold mt-6">6. Your Rights</h2>
    <p class="text-muted leading-relaxed">
      Depending on where you live, you may have the right to access, correct, export, or delete
      the personal information we hold about you, and to object to or restrict certain processing.
      To exercise these rights, email
      <a href="mailto:support@hookcrow.com" class="text-primary hover:underline">support@hookcrow.com</a>.
      We will respond within the timeframe required by applicable law.
    </p>

    <h2 class="text-lg font-semibold mt-6">7. Children's Privacy</h2>
    <p class="text-muted leading-relaxed">
      The Service is not directed to children under 16. If we learn that we have collected
      personal information from a child under 16 without parental consent, we will delete it.
    </p>

    <h2 class="text-lg font-semibold mt-6">8. Security</h2>
    <p class="text-muted leading-relaxed">
      We use industry-standard technical and organisational measures to protect your data,
      including encryption in transit and at rest via our infrastructure providers. No system is
      perfectly secure, however, so we cannot guarantee absolute security.
    </p>

    <h2 class="text-lg font-semibold mt-6">9. International Transfers</h2>
    <p class="text-muted leading-relaxed">
      Our sub-processors operate globally, which means your information may be transferred to and
      processed in countries other than your own. Where required by law, we rely on appropriate
      safeguards for those transfers.
    </p>

    <h2 class="text-lg font-semibold mt-6">10. Changes to This Policy</h2>
    <p class="text-muted leading-relaxed">
      We may update this Privacy Policy from time to time. When we make material changes we will
      update the "Last updated" date above and, where appropriate, notify you directly.
    </p>

    <h2 class="text-lg font-semibold mt-6">11. Contact</h2>
    <p class="text-muted leading-relaxed">
      For any privacy question, visit our
      <NuxtLink to="/contact" class="text-primary hover:underline">contact page</NuxtLink>
      or email
      <a href="mailto:support@hookcrow.com" class="text-primary hover:underline">support@hookcrow.com</a>.
    </p>
  </div>
</template>
