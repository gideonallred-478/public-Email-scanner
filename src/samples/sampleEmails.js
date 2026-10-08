/**
 * Static sample messages for classroom / demo use only.
 */

export const SAMPLE_EMAILS = [
  {
    id: "announcement",
    label: "Normal school announcement",
    sender: "office@lincoln-high.edu",
    subject: "Early dismissal Friday — schedule reminder",
    body: `Dear families,

This is a reminder that Friday, May 16 is a half day for teacher professional development. Buses will depart at 12:15 PM.

If you have questions, reply to this message or call the main office at (555) 010-2000.

Thank you,
Lincoln High Office`,
    hasAttachment: false,
    spreadCount: 1,
  },
  {
    id: "teacher",
    label: "Normal teacher / classroom email",
    sender: "mrivera@lincoln-high.edu",
    subject: "Algebra II — homework for Chapter 9",
    body: `Hi everyone,

Please complete the odd problems on page 342 for Monday. Solutions are posted on our class page: https://classroom.lincoln-high.edu/algebra2/ch9

Extra help is Wednesday after school in room 214.

— Ms. Rivera`,
    hasAttachment: true,
    spreadCount: 1,
  },
  {
    id: "scholarship-scam",
    label: "Scholarship scam",
    sender: "awardsdesk@college-grants-support.net",
    subject: "CONGRATULATIONS — You won a $10,000 scholarship!",
    body: `Dear Student,

Our records show you are a FINAL WINNER for an exclusive scholarship. This is a limited time opportunity and you must act now.

Claim your free money by verifying your personal information here: http://secure-scholarship-claim.xyz/verify

Urgent: verify immediately or your prize will be given to another student.

Sincerely,
National Scholarship Bureau`,
    hasAttachment: false,
    spreadCount: 14,
  },
  {
    id: "fake-reset",
    label: "Fake password reset",
    sender: "security-noreply@accounts-updates-mail.com",
    subject: "Final warning: account locked",
    body: `Hello,

We detected unusual sign-in activity. Your account has been locked until you reset your password.

Reset password: https://login-verify-now-support.com/reset?user=student

If you do not verify immediately, your email will be permanently suspended.

Thank you,
IT Security`,
    hasAttachment: false,
    spreadCount: 3,
  },
  {
    id: "weird-link",
    label: "Weird unknown / blocked-style link",
    sender: "updates@unknown-notify-service.io",
    subject: "Action required on your document",
    body: `Hi,

Someone shared a document with you. Open it before the link expires:

http://192.168.0.254/track?redirect=http%3A%2F%2Fbit.ly%2Fxyz789-unknown

This is urgent. Act now — limited time access.

Also please confirm your login code and bank account on file by replying with your social security number for verification.

Thanks`,
    hasAttachment: true,
    spreadCount: 52,
  },
  {
    id: "lookalike-trusted-exact",
    label: "Lookalike demo — exact trusted Google Docs link",
    sender: "teacher@lincoln-high.edu",
    subject: "Please complete the form",
    body: `Hi,

Please use our official form here:

https://docs.google.com/forms/example

Thank you,
Lincoln High`,
    hasAttachment: false,
    spreadCount: 1,
  },
  {
    id: "lookalike-docs-login",
    label: "Lookalike demo — docs login clone",
    sender: "notify@docs-google-login.com",
    subject: "Verify your document access",
    body: `Hello,

Your document access needs verification:

https://docs-google-login.com/verify

Thanks`,
    hasAttachment: false,
    spreadCount: 1,
  },
  {
    id: "lookalike-fafsa",
    label: "Lookalike demo — FAFSA help clone",
    sender: "support@fafsa-help-login.net",
    subject: "FAFSA account help",
    body: `Student,

Please update your FAFSA account here:

https://fafsa-help-login.net/account

Regards,
Student Aid Support`,
    hasAttachment: false,
    spreadCount: 1,
  },
  {
    id: "lookalike-g00gle",
    label: "Lookalike demo — g00gle character swap",
    sender: "security@g00gle.com",
    subject: "Sign in alert",
    body: `Hello,

Unusual sign-in detected. Review your account:

https://g00gle.com/login

Google Security`,
    hasAttachment: false,
    spreadCount: 1,
  },
  {
    id: "lookalike-collegeboard",
    label: "Lookalike demo — College Board login clone",
    sender: "alerts@college-board-login.com",
    subject: "Reset your College Board password",
    body: `Hello,

Reset your password using the secure link below:

https://college-board-login.com/reset

College Board Support`,
    hasAttachment: false,
    spreadCount: 1,
  },
];

export function getSampleById(id) {
  return SAMPLE_EMAILS.find((s) => s.id === id) ?? null;
}
