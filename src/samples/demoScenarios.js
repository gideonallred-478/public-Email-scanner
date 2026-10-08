import { parseEmail } from "../parser/emailParser.js";
import { scoreEmail } from "../scanner/scoringEngine.js";
import { getDefaultScoringSettings } from "../scanner/scoringSettings.js";
import { getDefaultSiteLists } from "../scanner/trustedLinksStore.js";

/**
 * Presentation demo scenarios (local demo only).
 */

/** @typedef {typeof DEMO_SCENARIOS[number]} DemoScenario */

export const DEMO_SCENARIOS = [
  {
    id: "safe-school-announcement",
    title: "Safe School Announcement",
    summary:
      "A routine office message from a trusted school domain with no risky links.",
    teachesConcept: "Shows normal low-risk school communication.",
    presenterNote:
      "Point out that the scanner allows routine mail — it does not treat every email as dangerous.",
    expectedBehavior:
      "Low risk. No dashboard or urgent alert. Shows normal school mail is allowed.",
    sender: "office@lincoln-high.edu",
    subject: "Early dismissal Friday — schedule reminder",
    body: `Dear families,

This is a reminder that Friday, May 16 is a half day for teacher professional development. Buses will depart at 12:15 PM.

If you have questions, reply to this message or call the main office at (555) 010-2000.

Thank you,
Lincoln High Office`,
    hasAttachment: false,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "normal-teacher-email",
    title: "Normal Teacher / Classroom Email",
    summary:
      "A teacher message with homework instructions and a class page link.",
    teachesConcept: "Shows trusted school senders and normal classroom links.",
    presenterNote:
      "Mention that a trusted sender can keep the score low even when an attachment is flagged.",
    expectedBehavior:
      "Low risk. Trusted sender keeps the score calm even with an attachment flag.",
    sender: "mrivera@lincoln-high.edu",
    subject: "Algebra II — homework for Chapter 9",
    body: `Hi everyone,

Please complete the odd problems on page 342 for Monday. Solutions are posted on our class page: https://classroom.lincoln-high.edu/algebra2/ch9

Extra help is Wednesday after school in room 214.

— Ms. Rivera`,
    hasAttachment: true,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "slightly-weird-unknown-link",
    title: "Slightly Weird Unknown Link",
    summary:
      "An unfamiliar sender with one odd link — suspicious, but not an automatic block.",
    teachesConcept: "Shows caution for unknown senders without automatic blocking.",
    presenterNote:
      "Explain that unknown links get warnings and review — not an instant block.",
    expectedBehavior:
      "Caution or moderate warning. The system warns and reviews instead of treating unknown as instantly dangerous.",
    sender: "updates@unknown-notify-service.io",
    subject: "Please review this shared document",
    body: `Hi,

Someone shared a document with you. Open it before the link expires:

http://student-docs-review-now.io/open?id=88421

Thanks,
Document Notifications`,
    hasAttachment: false,
    spreadCount: 6,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "scholarship-scam",
    title: "Scholarship Scam",
    summary:
      "Fake scholarship winner message with urgent language and a suspicious claim link.",
    teachesConcept: "Shows urgency and suspicious offer language in a scholarship scam.",
    presenterNote:
      "Point out that the scanner does not just say dangerous — it explains which signals caused the risk score.",
    expectedBehavior:
      "Multiple scam and urgency signals raise the score and create a review alert with clear reasons.",
    sender: "awardsdesk@college-grants-support.net",
    subject: "CONGRATULATIONS — You won a $10,000 scholarship!",
    body: `Dear Student,

Our records show you are a FINAL WINNER for an exclusive scholarship. This is a limited time opportunity and you must act now.

Claim your prize by verifying your student profile here: https://student-opportunities.net/verify

Act now or your prize will be given to another student.

Sincerely,
National Scholarship Bureau`,
    hasAttachment: false,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "fake-password-reset",
    title: "Fake Password Reset",
    summary:
      "Phishing-style login and password reset demand from an untrusted domain.",
    teachesConcept: "Shows password and login phishing with urgent account language.",
    presenterNote:
      "Highlight sensitive-request detection and why students should never reset passwords from email links.",
    expectedBehavior:
      "High-risk password-reset phishing triggers an urgent response and an alert record in the Alerts tab.",
    sender: "security-noreply@accounts-updates-mail.com",
    subject: "Final warning: account locked — reset password now",
    body: `Hello,

We detected unusual sign-in activity. Your account has been locked until you reset your password.

Reset password: https://login-verify-now-support.com/reset?user=student

If you do not verify immediately, your email will be permanently suspended.

Thank you,
IT Security`,
    hasAttachment: false,
    spreadCount: 3,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "lookalike-domain-attack",
    title: "Lookalike Domain Attack",
    summary:
      "A fake Google Docs login page that resembles a trusted service but is not official.",
    teachesConcept: "Shows fake domains that imitate real companies like Google Docs.",
    presenterNote:
      "Compare the link domain to the real service — lookalike detection catches spelling tricks.",
    expectedBehavior:
      "Lookalike domain detection and login-style wording raise the score and trigger review.",
    sender: "notify@docs-google-login.com",
    subject: "Verify your document access",
    body: `Hello,

Your document access needs verification:

https://docs-google-login.com/verify

Thanks,
Google Docs Support`,
    hasAttachment: false,
    spreadCount: 1,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
  {
    id: "trusted-link-spreading-fast",
    title: "Trusted Link Spreading Too Fast",
    summary:
      "A trusted Google Docs link, but the message spread widely and students reported it.",
    teachesConcept: "Shows trust decay when a trusted link spreads too fast and gets reported.",
    presenterNote:
      "Use this to explain that even trusted links need review when spread and reports spike.",
    expectedBehavior:
      "Trusted bonuses decay when spread and reports are high, so the message is escalated for review.",
    sender: "teacher@lincoln-high.edu",
    subject: "Please complete the form today",
    body: `Hi,

Please use our official form here:

https://docs.google.com/forms/example

Thank you,
Lincoln High`,
    hasAttachment: false,
    spreadCount: 85,
    studentReportCount: 3,
    verifiedSchoolAccount: false,
  },
  {
    id: "known-dangerous-domain",
    title: "Known Dangerous Domain",
    summary:
      "Message links to a domain on the local dangerous site list.",
    teachesConcept: "Shows blocklisted high-risk domain detection on a dangerous site list.",
    presenterNote:
      "Show the Alerts tab afterward to connect the score to simulated IT response.",
    expectedBehavior:
      "A known dangerous domain adds a major penalty and triggers the strongest review path.",
    sender: "alerts@school-security-notices.net",
    subject: "Immediate action required on your account",
    body: `Student,

Your account requires immediate verification on our secure portal:

https://fake-login-verify.com/confirm

Do not ignore this message.

School Security Desk`,
    hasAttachment: false,
    spreadCount: 2,
    studentReportCount: 0,
    verifiedSchoolAccount: false,
  },
];

const DEFAULT_SITE_LISTS = getDefaultSiteLists();
const DEFAULT_SCORING_SETTINGS = getDefaultScoringSettings();

export function getDemoScenarioById(id) {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function scenarioToScanInput(scenario) {
  return {
    sender: scenario.sender,
    subject: scenario.subject,
    body: scenario.body,
    hasAttachment: Boolean(scenario.hasAttachment),
    spreadCount: scenario.spreadCount ?? 1,
    studentReportCount: scenario.studentReportCount ?? 0,
    verifiedSchoolAccount: Boolean(scenario.verifiedSchoolAccount),
  };
}

/**
 * Produce the score shown on demo cards from the same scanner and active lists /
 * settings used by the real demo run. Defaults keep this helper convenient for
 * tests and callers that do not have React context available.
 */
export function getDemoScenarioPreview(
  scenario,
  siteLists = DEFAULT_SITE_LISTS,
  scoringSettings = DEFAULT_SCORING_SETTINGS
) {
  const parsed = parseEmail(scenarioToScanInput(scenario));
  const scoreResult = scoreEmail(parsed, siteLists, scoringSettings);

  return {
    score: scoreResult.score,
    riskLevel: scoreResult.riskLevel,
  };
}
