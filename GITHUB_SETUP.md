# GitHub Repository Setup

## Manual Setup Instructions

Since GitHub CLI is not installed, follow these steps to push your code:

### 1. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `wealthpilot-pro`
3. Description: `Portfolio Management & Financial Analytics Platform`
4. Keep it **Private** (contains API configurations)
5. Do NOT initialize with README (we already have code)
6. Click **Create repository**

### 2. Push to GitHub

Run these commands in your terminal:

```bash
cd "/Users/yogeshsinghkatoch/Desktop/FUll BLAST/wealthpilot-pro-v27-complete"

# Add remote origin (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/wealthpilot-pro.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Set Up Repository Secrets

After pushing, go to your repository Settings → Secrets and variables → Actions.

Add these secrets for CI/CD:

| Secret Name | Description | Where to get |
|-------------|-------------|--------------|
| `JWT_SECRET` | JWT signing key | Copy from your .env |
| `POSTGRES_URL` | PostgreSQL connection | Your database provider |
| `REDIS_URL` | Redis connection | Your Redis provider |
| `ALPHA_VANTAGE_API_KEY` | Market data API | alpha-vantage.co |
| `OPENAI_API_KEY` | AI features | platform.openai.com |

### 4. Enable GitHub Actions

1. Go to repository → Actions tab
2. Click "I understand my workflows, go ahead and enable them"

### 5. Install GitHub CLI (Optional)

For future use, install GitHub CLI:

```bash
# macOS (with Homebrew)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install gh

# Or download from: https://cli.github.com/

# Authenticate
gh auth login
```

## Quick Commands After Setup

```bash
# Check remote
git remote -v

# Push changes
git push

# Create PR
gh pr create --title "Feature: ..." --body "Description..."

# Check CI status
gh run list
```
