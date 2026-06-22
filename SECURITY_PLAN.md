# Cybersecurity Plan - juqeboks

## 1. Authentication & Session Management

| Issue | Risk | Fix |
|-------|------|-----|
| JWT stored in localStorage | XSS can steal tokens | Move to httpOnly cookies or add short expiry + refresh tokens |
| No rate limiting on /auth/register and /auth/login | Brute force / credential stuffing | Add express-rate-limit (e.g. 5 attempts per 15 min per IP) |
| No password strength enforcement on backend | Weak passwords | Enforce min 8 chars, 1 number, 1 special char server-side |
| Token never expires (or very long expiry) | Stolen token = permanent access | Set JWT expiry to 1h, implement refresh token flow |

## 2. Input Validation & Injection

| Issue | Risk | Fix |
|-------|------|-----|
| User input rendered in DOM without sanitization | XSS attacks | Always use escapeHtml() for all user content; use textContent instead of innerHTML where possible |
| No server-side input validation | SQL injection, NoSQL injection | Validate and sanitize all inputs server-side (use express-validator or joi) |
| File upload accepts any audio/* | Malicious file upload | Validate MIME type server-side, scan files, limit size (e.g. 50MB) |

## 3. API Security

| Issue | Risk | Fix |
|-------|------|-----|
| CORS too permissive | Unauthorized origins can access API | Restrict CORS to juqeboks.com, github.io, and localhost only |
| No request size limits | DoS via large payloads | Add express body-parser limit (e.g. 10MB) |
| API keys/secrets in .env not rotated | Leaked secrets = full compromise | Rotate Stripe keys quarterly, use environment-specific keys |
| No HTTPS enforcement | Man-in-the-middle attacks | Redirect all HTTP to HTTPS, set HSTS header |

## 4. Payment Security (Stripe)

| Issue | Risk | Fix |
|-------|------|-----|
| Stripe webhook not verified | Fake payment confirmations | Always verify webhook signature with stripe.webhooks.constructEvent() |
| No idempotency on payment creation | Duplicate charges | Use Stripe idempotency keys |
| Payment status stored client-side | Users can fake payment status | Always verify payment status server-side before granting access |

## 5. Data Protection & Privacy

| Issue | Risk | Fix |
|-------|------|-----|
| User data potentially exposed in API responses | Privacy violation | Only return necessary fields, never expose password hashes |
| No data encryption at rest | Database breach = exposed data | Encrypt sensitive fields (email, payment info) |
| No GDPR compliance | Legal risk in EU | Add data export, deletion endpoint, privacy policy link |
| Logs may contain sensitive data | Log breach = data leak | Sanitize logs, never log passwords or tokens |

## 6. Infrastructure

| Issue | Risk | Fix |
|-------|------|-----|
| Dependencies have 24 vulnerabilities (npm audit) | Known exploits | Run `npm audit fix`, update packages regularly |
| No Content-Security-Policy header | XSS, clickjacking | Add CSP header restricting scripts to self + trusted CDNs |
| No security headers (X-Frame-Options, etc.) | Clickjacking, MIME sniffing | Use helmet.js middleware |
| Database credentials in .env file | Accidental commit = breach | Add .env to .gitignore, use secret management in production |

## 7. Immediate Action Items (Priority Order)

1. **[CRITICAL]** Run `npm audit fix --force` to patch known vulnerabilities
2. **[CRITICAL]** Add helmet.js for security headers
3. **[HIGH]** Add rate limiting to auth endpoints
4. **[HIGH]** Verify Stripe webhook signatures
5. **[HIGH]** Restrict CORS origins
6. **[MEDIUM]** Move JWT to httpOnly cookies with short expiry
7. **[MEDIUM]** Add express-validator for all API inputs
8. **[MEDIUM]** Add Content-Security-Policy
9. **[LOW]** Implement token refresh flow
10. **[LOW]** Add GDPR data export/delete endpoints

## 8. Quick Wins (Can implement in 1 day)

```bash
# Install security packages
npm install helmet express-rate-limit cors express-validator
```

```javascript
// server.js additions
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per window
  message: { error: 'Too many attempts, please try again later.' }
});

app.use('/api/auth/', authLimiter);
```

## 9. Monitoring & Incident Response

- Set up error logging (e.g. Sentry) for production
- Monitor failed login attempts
- Set up alerts for unusual API traffic patterns
- Have a plan for token revocation if breach is detected
- Regular security audits (quarterly)

---

*Last updated: June 2026*
