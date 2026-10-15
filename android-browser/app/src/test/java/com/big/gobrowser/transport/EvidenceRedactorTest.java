package com.big.gobrowser.transport;

public final class EvidenceRedactorTest {
    @org.junit.Test public void exportRules() { main(new String[0]); }
    public static void main(String[] args) {
        String[] bad = {
            "Cookie: landing=https://example.com; session=canary",
            "Cookie: csrf=ok; session=canary", "Set-Cookie: session=canary; Secure; HttpOnly",
            "Cookie: csrf=ok; session=canary", "token=canary", "API_KEY: canary", "\"access_token\": \"canary\"",
            "Authorization: Bearer canary", "PASSWORD = 'canary'", "token:\ncanary",
            "https://alice:canary@example.com/path?x=canary#canary",
            "https://example.com/?%74oken=canary", "api%5Fkey%3Dcanary",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.canarySignature",
            "token=\"first canary second\""
        };
        for (String input : bad) {
            String clean = EvidenceRedactor.redact(input);
            if (clean.contains("canary")) throw new AssertionError("Credential leaked: " + input + " -> " + clean);
        }
        String link="Visit https://example.com/a%20b then continue";
        if (!link.equals(EvidenceRedactor.redact(link))) throw new AssertionError("Encoded URL changed");
        String once=EvidenceRedactor.redact("token=canary");
        if (!once.equals(EvidenceRedactor.redact(once))) throw new AssertionError("Redaction is not idempotent");
        String normal = "Open https://example.com/a%20b and save this place · กรุงเทพ";
        if (!normal.equals(EvidenceRedactor.redact(normal))) throw new AssertionError("Normal evidence changed");
        if (!"https://example.com/a%20b".equals(EvidenceRedactor.sanitizeUrl("https://user:secret@example.com/a%20b?token=x#fragment")))
            throw new AssertionError("URL sanitation broke raw path");
        if (!"".equals(EvidenceRedactor.sanitizeUrl("javascript:alert(1)"))) throw new AssertionError("Unsafe URL accepted");
    }
}
