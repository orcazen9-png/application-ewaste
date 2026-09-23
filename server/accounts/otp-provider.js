import {fail} from './common.js';

// Test suites may replace the outbound transport. There is no public test-code endpoint,
// magic OTP, or environment setting that approves a code without a provider response.
export function otpProvider(env) {
  const account = env.TWILIO_ACCOUNT_SID, service = env.TWILIO_VERIFY_SERVICE_SID, secret = env.TWILIO_AUTH_TOKEN;
  if (!/^AC[a-fA-F0-9]{32}$/.test(account || '') || !/^VA[a-fA-F0-9]{32}$/.test(service || '') || !secret) {
    fail('Mobile sign-in is not available yet. Please try again later.', 503);
  }
  const transport = env.OTP_TRANSPORT || fetch;
  async function call(endpoint, values) {
    let response;
    try {
      response = await transport(`https://verify.twilio.com/v2/Services/${service}/${endpoint}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {'Authorization': 'Basic ' + btoa(account + ':' + secret), 'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams(values).toString(),
      });
    } catch { fail('The mobile verification service could not be reached. Please retry.', 503); }
    if (response.status === 429) fail('Too many verification attempts. Please wait before retrying.', 429);
    if (endpoint === 'VerificationCheck' && [400, 404].includes(response.status)) return {status: 'invalid'};
    if (!response.ok) fail('The mobile verification service is temporarily unavailable.', 503);
    try { return await response.json(); } catch { fail('The mobile verification service returned an invalid response.', 503); }
  }
  return {
    async start(mobile, language) {
      const result = await call('Verifications', {To: mobile, Channel: 'sms', Locale: language});
      if (!/^VE[a-fA-F0-9]{32}$/.test(result.sid || '') || result.status !== 'pending') fail('Verification could not be started.', 503);
      return result.sid;
    },
    async verify(reference, code) {
      const result = await call('VerificationCheck', {VerificationSid: reference, Code: code});
      return result.status === 'approved' && result.sid === reference;
    },
  };
}
