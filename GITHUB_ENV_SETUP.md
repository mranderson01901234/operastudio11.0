# GitHub OAuth Environment Variables Setup

## Required Environment Variables

Add these to your `.env` file (or `.env.local`):

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=Ov23liHhuxIxnLme4ZZe
GITHUB_CLIENT_SECRET=2098bfb125e1e944b8c315cfffbaa029b37ff2ea

# App URL (already set if you have Gmail working)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Token Encryption Key (reuse from email feature)
# EMAIL_ENCRYPTION_KEY=your_existing_key_here
```

## Quick Setup Steps

1. **Open your `.env` file** (or `.env.local` if you're using that)

2. **Add the GitHub credentials:**
   ```bash
   GITHUB_CLIENT_ID=Ov23liHhuxIxnLme4ZZe
   GITHUB_CLIENT_SECRET=2098bfb125e1e944b8c315cfffbaa029b37ff2ea
   ```

3. **Verify `NEXT_PUBLIC_APP_URL` is set:**
   ```bash
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
   (Or your production URL if deploying)

4. **Restart your development server** for changes to take effect:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## GitHub OAuth App Configuration

Make sure your GitHub OAuth App is configured with:

- **Homepage URL:** `http://localhost:3000` (or your production URL)
- **Authorization callback URL:** `http://localhost:3000/api/github/callback` (or your production URL + `/api/github/callback`)

## Testing

After adding the credentials:

1. Restart your dev server
2. Navigate to your app
3. Click "GitHub" in the sidebar
4. Click "Connect GitHub"
5. You should be redirected to GitHub for authorization
6. After authorizing, you'll be redirected back and your repositories should load

## Security Note

⚠️ **Never commit your `.env` file to git!** It's already in `.gitignore` for security.

