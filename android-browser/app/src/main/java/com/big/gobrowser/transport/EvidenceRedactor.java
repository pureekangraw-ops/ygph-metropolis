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
        + "(?:\\[REDACTED\\]|[\\\"][^\\\"]*[\\\"]|'[^']*'|(?:Bearer\\s+|Basic\\s+)?[^\\s,;\\u001f}\\]]+)");
    private static final Pattern COOKIE = Pattern.compile("(?im)((?:set-cookie|cookie)\\s*[:=]\\s*)[^\\r\\n\\u001f]+" );
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
        return redactFragment(raw == null ? "" : raw, true);
    }

    private static String redactFragment(String raw, boolean decode) {
        String text = PRIVATE_KEY.matcher(raw).replaceAll(Matcher.quoteReplacement(HIDDEN));
        text = COOKIE.matcher(text).replaceAll("$1" + HIDDEN);
        Matcher urls = URL.matcher(text);
        StringBuilder result = new StringBuilder();
        int end = 0;
        while (urls.find()) {
            result.append(cleanPlain(text.substring(end, urls.start()), decode));
            // Retain URL path escapes; remove userinfo, query and fragment before text processing.
            result.append(cleanPlain(sanitizeUrl(urls.group()), false));
            end = urls.end();
        }
        result.append(cleanPlain(text.substring(end), decode));
        return result.toString();
    }

    private static String cleanPlain(String raw, boolean decode) {
        String text = raw;
        if (decode) {
            for (int i = 0; i < 3 && text.indexOf('%') >= 0; i++) {
                try {
                    String decoded = URLDecoder.decode(text.replace("+", "%2B"), StandardCharsets.UTF_8.name());
                    if (decoded.equals(text)) break;
                    text = decoded;
                } catch (Exception ignored) { break; }
            }
            if (!text.equals(raw)) return redactFragment(text, false);
        }
        text = COOKIE.matcher(text).replaceAll("$1" + HIDDEN);
        text = ASSIGNMENT.matcher(text).replaceAll("$1" + HIDDEN);
        text = BEARER.matcher(text).replaceAll(Matcher.quoteReplacement(HIDDEN));
        return TOKEN.matcher(text).replaceAll(Matcher.quoteReplacement(HIDDEN));
    }
}
