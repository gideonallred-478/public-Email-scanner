/**
 * Layer 1 — Email Parser Foundation
 * Pure functions: no network, no storage.
 */

import addressparser from "nodemailer/lib/addressparser/index.js";

const URL_REGEX =
  /\b(https?:\/\/[^\s<>"'{}|\\^`\[\]]+|www\.[^\s<>"'{}|\\^`\[\]]+)/gi;

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const URGENT_PHRASES = [
  "urgent",
  "act now",
  "final warning",
  "account locked",
  "verify immediately",
  "limited time",
  "hurry",
  "claim your slot",
];

/** Common in legitimate school mail — weak signal only (+0.5 each). */
const SOFT_CONTEXT_PHRASES = ["limited slots", "fill out the form"];

const SENSITIVE_REQUEST_PHRASES = [
  "password",
  "login code",
  "social security",
  "ssn",
  "bank account",
  "credit card",
  "personal information",
];

const SCAM_KEYWORDS = [
  "scholarship",
  "winner",
  "prize",
  "free money",
  "free scholarship",
  "claim",
  "verify",
  "reset password",
  "secure website",
  "secure site",
];

const AUTHENTICATION_REQUEST_PATTERNS = [
  /\bsign\s*in\b/i,
  /\blog\s*in\b/i,
  /\bauthenticate\b/i,
  /\breset (?:your )?password\b/i,
  /\bverify (?:your )?account\b/i,
  /\benter (?:your )?(?:username|user name)(?: and (?:your )?password)?\b/i,
  /\b(?:enter|provide|submit) (?:your )?(?:password|credentials|(?:username|user name)(?: and (?:your )?password)?)\b/i,
  /\buse (?:your )?(?:normal |district |school |work )?(?:account|credentials)\b/i,
  /\bconfirm (?:your )?(?:identity|account access)\b/i,
];

const DEADLINE_PRESSURE_PATTERNS = [
  /\bbefore\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the cutoff|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
  /\b(?:batch|window|review|access)\s+closes?\b/i,
  /\bneeds? to be (?:acknowledged|confirmed|completed) before\b/i,
  /\b(?:held|delayed|suspended|disabled|locked) for (?:manual )?review\b/i,
  /\bif (?:no|you do not|we do not receive).{0,80}\b(?:cutoff|deadline|held|delayed|suspended|disabled|locked)\b/i,
];

const HIGH_RISK_WORKFLOWS = [
  { name: "payroll", pattern: /\b(?:payroll|direct[ -]deposit|ach|paycheck|benefits enrollment)\b/i },
  { name: "payment", pattern: /\b(?:invoice|wire transfer|payment destination|banking details)\b/i },
  { name: "account recovery", pattern: /\b(?:password reset|account recovery|security verification)\b/i },
  { name: "document sharing", pattern: /\b(?:shared document|secure document|document review)\b/i },
];

const AUTHORITY_ROLES = [
  { name: "payroll", pattern: /\bpayroll(?: operations)?\b/i },
  { name: "human resources", pattern: /\b(?:human resources|hr department|benefits office)\b/i },
  { name: "it support", pattern: /\b(?:it support|service desk|security team|administrator)\b/i },
  { name: "finance", pattern: /\b(?:finance|accounts payable|billing)\b/i },
];

function firstMatchingCategory(text, categories) {
  return categories.find(({ pattern }) => pattern.test(text))?.name ?? "";
}

function normalizeForMatch(text) {
  return text.toLowerCase();
}

function maskUrls(text) {
  return text.replace(
    new RegExp(URL_REGEX.source, URL_REGEX.flags),
    (url) => " ".repeat(url.length)
  );
}

/**
 * @param {string} haystack lowercased
 * @param {string} phrase
 */
function phrasePattern(phrase, flags = "i") {
  const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const escaped = parts.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(escaped.join("\\W+"), flags);
}

function phraseMatches(haystack, phrase) {
  const p = phrase.toLowerCase();
  if (!p.includes(" ")) {
    return haystack.includes(p);
  }
  return phrasePattern(p).test(haystack);
}

function findSensitiveRequestMatches(haystack) {
  return SENSITIVE_REQUEST_PHRASES.filter((phrase) => {
    const matches = [...haystack.matchAll(phrasePattern(phrase, "gi"))];
    return matches.some((match) => {
      const sentenceStart = Math.max(
        haystack.lastIndexOf(".", match.index - 1),
        haystack.lastIndexOf("!", match.index - 1),
        haystack.lastIndexOf("?", match.index - 1),
        haystack.lastIndexOf("\n", match.index - 1)
      ) + 1;
      const endingCandidates = [".", "!", "?", "\n"]
        .map((delimiter) => haystack.indexOf(delimiter, match.index + match[0].length))
        .filter((index) => index >= 0);
      const sentenceEnd = endingCandidates.length
        ? Math.min(...endingCandidates)
        : haystack.length;
      const sentence = haystack.slice(sentenceStart, sentenceEnd);
      const localIndex = match.index - sentenceStart;
      const preceding = sentence.slice(0, localIndex);
      const following = sentence.slice(localIndex + match[0].length);
      const deniedBefore =
        /(?:do not|don't|never|will not|won't|will never|not)\s+(?:(?:be\s+asked|required|expected|needed)\s+to\s+)?(?:ask(?: you)?(?: to| for)?|require(?: you)?(?: to| for)?|enter|provide|share|send|disclose)\b[^.!?]{0,40}$/i.test(
          preceding
        ) || /\bnot\s+(?:your\s+)?$/i.test(preceding);
      const deniedAfter =
        /^(?:\s+(?:number|details|information))?\s+(?:is|are)\s+(?:never|not)\s+(?:requested|required|needed|collected|shared)\b/i.test(
          following
        );
      const requestedBefore =
        /\b(?:provide|enter|share|send|submit|confirm|verify|type|give|disclose|supply|reply with|ask(?:s|ed|ing)?(?: you)? for|require(?:s|d|ing)?(?: you)? to|need(?:s|ed)?(?:\s+your)?|complete(?:\s+the)?\s+form\s+with(?:\s+your)?)\b[^.!?]{0,40}$/i.test(
          preceding
        );
      const requestedAfter =
        /^(?:\s+(?:number|details|information))?\s+(?:is|are)\s+(?:required|needed|requested)\b(?!\s+(?:to be|for)\b)/i.test(
          following
        );
      const describesRequirements = /^\s+requirements?\b/i.test(following);
      return (
        !deniedBefore &&
        !deniedAfter &&
        !describesRequirements &&
        (requestedBefore || requestedAfter)
      );
    });
  });
}

/**
 * @param {string} haystack lowercased
 * @param {string[]} needles original case preserved in output list
 */
function findPhraseMatches(haystack, needles) {
  const found = new Set();
  for (const phrase of needles) {
    if (phraseMatches(haystack, phrase)) {
      found.add(phrase);
    }
  }
  return [...found];
}

/**
 * @param {string} sender
 * @returns {{ domain: string, warning?: string }}
 */
export function extractSenderDomain(sender) {
  const trimmed = sender.trim();
  if (!trimmed) {
    return { domain: "", warning: "Sender email is empty." };
  }

  let emailCandidate = trimmed;
  const angleMatch = trimmed.match(/<([^>]+)>/);
  if (angleMatch) {
    emailCandidate = angleMatch[1].trim();
  }

  if (!BASIC_EMAIL_REGEX.test(emailCandidate)) {
    return {
      domain: "",
      warning:
        "Sender does not look like a valid email address (expected name@domain.tld).",
    };
  }
  const at = emailCandidate.lastIndexOf("@");
  const domain = emailCandidate.slice(at + 1).toLowerCase();
  return { domain };
}

function extractEmailDomains(addressList) {
  const domains = [];
  const seen = new Set();

  function collect(entries) {
    for (const entry of entries) {
      if (Array.isArray(entry?.group)) {
        collect(entry.group);
        continue;
      }
      const address = String(entry?.address ?? "").trim();
      const at = address.lastIndexOf("@");
      if (at <= 0 || at === address.length - 1) continue;
      const domain = address.slice(at + 1).toLowerCase();
      if (!seen.has(domain)) {
        seen.add(domain);
        domains.push(domain);
      }
    }
  }

  collect(addressparser(String(addressList ?? "")));
  return domains;
}

/**
 * @param {string} raw
 * @returns {{ raw: string, domain: string, protocol: string, isValidUrl: boolean }}
 */
export function parseLink(raw) {
  const trimmed = String(raw ?? "").trim().replace(/[),.;]+$/, "");
  if (!trimmed) {
    return {
      raw: trimmed,
      domain: "unknown",
      protocol: "",
      isValidUrl: false,
      hasUserinfo: false,
    };
  }

  let href = trimmed;
  if (/^www\./i.test(href)) {
    href = `https://${href}`;
  }

  try {
    const url = new URL(href);
    const protocol = url.protocol.replace(":", "");
    const hasUserinfo = Boolean(url.username || url.password);
    return {
      raw: trimmed,
      domain: url.hostname.toLowerCase() || "unknown",
      protocol,
      isValidUrl: true,
      hasUserinfo,
    };
  } catch {
    return {
      raw: trimmed,
      domain: "unknown",
      protocol: "",
      isValidUrl: false,
      hasUserinfo: false,
    };
  }
}

function isNegatedMatch(text, match) {
  const sentenceStart = Math.max(
    text.lastIndexOf(".", match.index - 1),
    text.lastIndexOf("!", match.index - 1),
    text.lastIndexOf("?", match.index - 1),
    text.lastIndexOf("\n", match.index - 1)
  ) + 1;
  const preceding = text.slice(sentenceStart, match.index);
  return /(?:\bnever|\bdo not|\bdon't|\bwill not|\bwon't|\bnot|\bno\s+need(?:\s+for\s+you)?\s+to|\bnever\s+attempt\s+to|\bno\s+risk(?:\s+that)?\b[^.!?]{0,80}\bwill\s+be|\bwon't\s+have\s+to|\bnot\s+going\s+to\s+be\s+asked\s+to|\bunlikely\s+to\s+be\s+asked\s+to)(?:\s+be)?(?:\s+(?:ask|require)(?:\s+(?:you|users?|employees?))?\s+to|\s+asked\s+to|\s+need\s+to|\s+expected\s+to(?:\s+be(?:\s+asked\s+to)?)?|\s+required\s+to)?\s*$/i.test(
    preceding
  );
}

function findNonNegatedPatternMatches(text, patterns) {
  return patterns.flatMap((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return [...text.matchAll(new RegExp(pattern.source, flags))].filter(
      (match) => !isNegatedMatch(text, match)
    );
  });
}

function findAuthenticationLinkDomains(text) {
  const languageText = maskUrls(text);
  const authMatches = findNonNegatedPatternMatches(
    languageText,
    AUTHENTICATION_REQUEST_PATTERNS
  );
  if (!authMatches.length) return [];

  const urlMatches = [...text.matchAll(new RegExp(URL_REGEX.source, URL_REGEX.flags))];
  const domains = new Set();

  for (const authMatch of authMatches) {
    const authStart = authMatch.index;
    const authEnd = authStart + authMatch[0].length;
    const sameSentence = (between) =>
      !/(?:[!?\n]|\.\s)/.test(between);
    const explicitlyContinuesOnNextLine = (between) =>
      /^\s*(?:using\s+)?(?:the\s+)?link\s+below\s*:\s*\n\s*$/i.test(between);

    const following = urlMatches
      .filter((urlMatch) => {
        const urlStart = urlMatch.index;
        const between = text.slice(authEnd, urlStart);
        const unrelatedPurpose =
          /\bnot\b|\b(?:and\s+)?(?:see|read|view)\b|\b(?:documentation|help|privacy policy|support article|meeting details)\b/i.test(
            between
          );
        return (
          urlStart >= authEnd &&
          urlStart - authEnd <= 300 &&
          (sameSentence(between) || explicitlyContinuesOnNextLine(between)) &&
          !unrelatedPurpose
        );
      })
      .sort((left, right) => left.index - right.index);

    const referencesPrecedingPage = (urlMatch) => {
      const urlEnd = urlMatch.index + urlMatch[0].length;
      const between = text.slice(urlEnd, authStart);
      return /^\s*[.!?]?\s*(?:the|this)?\s*(?:review\s+)?(?:page|link|site)\b[^.!?]{0,100}\b(?:will|asks?|requires?)\b/i.test(
        between
      );
    };

    const preceding = urlMatches
      .filter((urlMatch) => {
        const urlEnd = urlMatch.index + urlMatch[0].length;
        const between = text.slice(urlEnd, authStart);
        const isSentenceTerminated = /[.!?]$/.test(urlMatch[0]);
        const explicitlyReferenced = referencesPrecedingPage(urlMatch);
        return (
          urlEnd <= authStart &&
          authStart - urlEnd <= 300 &&
          ((!isSentenceTerminated && sameSentence(between)) || explicitlyReferenced)
        );
      })
      .sort((left, right) => right.index - left.index)[0];

    const associated = [...following];
    if (preceding && (!following.length || referencesPrecedingPage(preceding))) {
      associated.push(preceding);
    }
    for (const urlMatch of associated) {
      const domain = parseLink(urlMatch[0]).domain;
      if (domain && domain !== "unknown") domains.add(domain);
    }
  }

  return [...domains];
}

/**
 * Extract unique link strings from body (order preserved).
 * @param {string} body
 * @returns {string[]}
 */
export function extractLinkStrings(body) {
  if (!body) return [];
  const matches = body.match(URL_REGEX) ?? [];
  const seen = new Set();
  const ordered = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  }
  return ordered;
}

/**
 * @param {{
 *   sender: string,
 *   subject: string,
 *   body: string,
 *   hasAttachment: boolean,
 *   spreadCount: number,
 *   studentReportCount?: number,
 *   verifiedSchoolAccount?: boolean
 * }} input
 */
export function parseEmail(input) {
  const sender = String(input.sender ?? "");
  const replyTo = String(input.replyTo ?? "");
  const subject = String(input.subject ?? "");
  const body = String(input.body ?? "");
  const hasAttachment = Boolean(input.hasAttachment);
  const spreadCountRaw = Number(input.spreadCount);
  const spreadCount =
    Number.isFinite(spreadCountRaw) && spreadCountRaw >= 1
      ? Math.floor(spreadCountRaw)
      : 1;
  const studentReportCountRaw = Number(input.studentReportCount);
  const studentReportCount =
    Number.isFinite(studentReportCountRaw) && studentReportCountRaw >= 0
      ? Math.floor(studentReportCountRaw)
      : 0;
  const verifiedSchoolAccount = Boolean(input.verifiedSchoolAccount);

  const { domain: senderDomain } = extractSenderDomain(sender);
  const replyToDomains = extractEmailDomains(replyTo);
  const replyToDomain = replyToDomains[0] ?? "";

  const combinedText = normalizeForMatch(`${subject}\n${body}`);
  const languageText = maskUrls(combinedText);

  const linkStrings = extractLinkStrings(body);
  const links = linkStrings.map((raw) => {
    try {
      return parseLink(raw);
    } catch {
      return {
        raw: String(raw ?? ""),
        domain: "unknown",
        protocol: "",
        isValidUrl: false,
        hasUserinfo: false,
      };
    }
  });

  const detectedUrgentPhrases = findPhraseMatches(
    combinedText,
    URGENT_PHRASES
  );
  const detectedSoftContextPhrases = findPhraseMatches(
    combinedText,
    SOFT_CONTEXT_PHRASES
  );
  const detectedSensitiveRequests = findSensitiveRequestMatches(languageText);
  const detectedKeywords = findPhraseMatches(combinedText, SCAM_KEYWORDS);
  const requestsAuthentication =
    findNonNegatedPatternMatches(languageText, AUTHENTICATION_REQUEST_PATTERNS).length > 0;
  const authenticationLinkDomains = findAuthenticationLinkDomains(combinedText);
  const hasDeadlinePressure =
    findNonNegatedPatternMatches(languageText, DEADLINE_PRESSURE_PATTERNS).length > 0;
  const highRiskWorkflow = firstMatchingCategory(combinedText, HIGH_RISK_WORKFLOWS);
  const authorityRole = firstMatchingCategory(`${sender}\n${subject}`, AUTHORITY_ROLES);

  return {
    sender: sender.trim(),
    senderDomain,
    replyTo: replyTo.trim(),
    replyToDomain,
    replyToDomains,
    subject,
    body,
    links,
    hasAttachment,
    spreadCount,
    studentReportCount,
    verifiedSchoolAccount,
    detectedKeywords,
    detectedSensitiveRequests,
    detectedUrgentPhrases,
    detectedSoftContextPhrases,
    requestsAuthentication,
    authenticationLinkDomains,
    hasDeadlinePressure,
    highRiskWorkflow,
    authorityRole,
  };
}
