const SECRET_PATTERNS: RegExp[] = [
  /sk-(live|test)-[A-Za-z0-9-_]{10,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[bap]-.+/g,
  /AKIA[0-9A-Z]{16}/g,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
  /-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END .*?-----/g,
];

export const REDACTED = '[REDACTED]';

/** Redacts secrets from any text before it leaves the machine. */
export class SecretRedactor {
  redact(text: string): { text: string; redactedCount: number } {
    let count = 0;
    let out = text;
    for (const re of SECRET_PATTERNS) {
      re.lastIndex = 0;
      out = out.replace(re, (m) => {
        count += 1;
        void m;
        return REDACTED;
      });
    }
    // .env-style lines: KEY=xxxx -> KEY=[REDACTED]
    out = out.replace(/^([A-Z_]{3,}(_KEY|_SECRET|_TOKEN|_PASSWORD)?)=.+$/gim, (m, k: string) => {
      if (/KEY|SECRET|TOKEN|PASSWORD|PRIVATE/i.test(k)) {
        count += 1;
        return `${k}=${REDACTED}`;
      }
      return m;
    });
    return { text: out, redactedCount: count };
  }

  shouldExcludeFile(filePath: string): boolean {
    return /(^|\/)\.env(\..*)?$|\.pem$|\.key$|credentials/i.test(filePath);
  }
}
