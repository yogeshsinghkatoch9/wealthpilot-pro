# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email the details to the maintainers
3. Include steps to reproduce
4. Allow time for a fix before public disclosure

## Security Best Practices

When deploying WealthPilot Pro:

- Never commit `.env` files
- Use strong JWT secrets (32+ characters)
- Enable HTTPS in production
- Keep dependencies updated
- Use rate limiting
- Validate all user inputs

## Known Security Considerations

- API keys should be stored as environment variables
- Database credentials must be kept secure
- Enable CORS only for trusted origins
- Use parameterized queries (Prisma handles this)
