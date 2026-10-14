package com.big.gobrowser.transport;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Export-only sanitation. Never change the local signatures used to approve an action. */
public final class EvidenceRedactor {
    private EvidenceRedactor() {}
    private static final String HIDDEN = "[REDACTED]";
    private static final Pattern URL = Pattern.compile("(?i)https?://[^\\s\\u0000-\\u001f<>\\\"']+");
    private static final Pattern ASSIGNMENT = Pattern.compile(
        "(?iu)([\\\"']?(?:access[_ -]?token|refresh[_ -]?token|id[_ -]?token|device[_ -]?token|owner[_ -]?token|token|api[_ -]?key|secret|client[_ -]?secret|password|passcode|authorization|cookie|รหัสผ่าน)[\\\"']?\\s*[:=]\\s*)"
        + "(?:[\\\"][^\\\"]*[\\\"]|'[^']*'|(?:Bearer\\s+|Basic\\s+)?[^\\s,;\\u001f}\\]]+)");
    private static final Pattern BEARER = Pattern.compile("(?i)\\b(?:Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]+");
    private static final Pattern TOKEN = Pattern.compile(
        "(?i)\\b(?:eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+|[0-9a-f]{64}|(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,})\\b");
    private static final Pattern PRIVATE_KEY = Pattern.compile("(?s)-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|$)");

    public static String sanitizeUrl(String raw) {
        try {
            URI uri = new URI(raw);
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) return "";
            String authority = uri.getRawAuthority();
            authority = authority.substring(authority.lastIndexOf('@') + 1);
            return uri.getScheme() + "://" + authority + (uri.getRawPath() == null ? "" : uri.getRawPath());
        } catch (Exception ignored) { return ""; }
    }

    public static String redact(String raw) {
        if (raw == null) return "";
        String text = raw;
        // Decode percent-encoded evidence before matching credentials. Keep literal '+' intact.
        for (int i = 0; i < 3 && text.indexOf('%') >= 0; i++) {
            try {
                String decoded = URLDecoder.decode(text.replace("+", "%2B"), StandardCharsets.UTF_8.name());
                if (decoded.equals(text)) break;
                text = decoded;
            } catch (Exception ignored) { break; }
        }
        text = PRIVATE_KEY.matcher(text).replaceAll(Matcher.quoteReplacement(HIDDEN));
        Matcher urls = URL.matcher(text);
        StringBuffer result = new StringBuffer();
        while (urls.find()) urls.appendReplacement(result, Matcher.quoteReplacement(sanitizeUrl(urls.group())));
        urls.appendTail(result);
        text = ASSIGNMENT.matcher(result.toString()).replaceAll("$1" + HIDDEN);
        text = BEARER.matcher(text).replaceAll(Matcher.quoteReplacement(HIDDEN));
        return TOKEN.matcher(text).replaceAll(Matcher.quoteReplacement(HIDDEN));
    }
}
