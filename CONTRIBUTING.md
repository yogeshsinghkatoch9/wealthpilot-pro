# Contributing to WealthPilot Pro

Thank you for your interest in contributing to WealthPilot Pro! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/wealthpilot-pro.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

## Development Setup

```bash
# Install backend dependencies
cd backend
npm install
cp .env.example .env

# Install frontend dependencies
cd ../frontend
npm install

# Start development servers
cd ../backend && npm run dev
cd ../frontend && npm run dev
```

## Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Use meaningful variable and function names
- Add comments for complex logic

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add dividend calendar feature
fix: resolve portfolio calculation error
docs: update API documentation
refactor: improve market data service
```

## Pull Request Guidelines

1. **Description**: Clearly describe what your PR does
2. **Testing**: Test your changes locally
3. **Screenshots**: Include screenshots for UI changes
4. **Breaking Changes**: Note any breaking changes

## Reporting Issues

When reporting issues, include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Browser/environment details

## Feature Requests

Feature requests are welcome! Please:

- Check existing issues first
- Describe the feature clearly
- Explain the use case
- Consider implementation approach

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open an issue with the `question` label or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
