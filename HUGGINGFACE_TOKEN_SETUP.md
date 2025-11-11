# How to Get Your Hugging Face Token

## Step-by-Step Guide

### Step 1: Create/Login to Hugging Face Account

1. Go to https://huggingface.co/
2. Click **"Sign Up"** (if you don't have an account) or **"Login"** (if you do)
3. You can sign up with:
   - Email
   - Google account
   - GitHub account

### Step 2: Generate an Access Token

1. Once logged in, click on your **profile picture** (top right)
2. Select **"Settings"** from the dropdown menu
3. In the left sidebar, click **"Access Tokens"**
4. Click the **"New token"** button
5. Fill in the form:
   - **Token name**: Give it a descriptive name (e.g., "OperaStudio Local Model")
   - **Type**: Select **"Read"** (this is sufficient for downloading public models)
   - **Expiration**: Choose how long the token should be valid (or leave blank for no expiration)
6. Click **"Generate token"**
7. **IMPORTANT**: Copy the token immediately - you won't be able to see it again!
   - It will look like: `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Set the Token in Your Environment

#### Option A: Set for Current Session (Temporary)

```bash
export HF_TOKEN="hf_your_token_here"
```

#### Option B: Add to Your Shell Profile (Permanent)

**For Bash:**
```bash
echo 'export HF_TOKEN="hf_your_token_here"' >> ~/.bashrc
source ~/.bashrc
```

**For Zsh:**
```bash
echo 'export HF_TOKEN="hf_your_token_here"' >> ~/.zshrc
source ~/.zshrc
```

#### Option C: Add to Your Project's Environment File

Add to your `.env.local` file (create it if it doesn't exist):

```bash
# In your project root directory
echo 'HF_TOKEN=hf_your_token_here' >> .env.local
```

**Note**: Make sure `.env.local` is in your `.gitignore` file so you don't commit your token!

### Step 4: Verify the Token is Set

```bash
echo $HF_TOKEN
```

You should see your token displayed (starting with `hf_`).

### Step 5: Test the Model Download

After setting the token, try downloading the model again:

```bash
npm run download-model
```

Or test the model:

```bash
npx tsx scripts/test-smollm.ts
```

## Security Best Practices

1. **Never commit your token to git** - Always use `.env.local` or environment variables
2. **Use Read-only tokens** - For downloading models, you only need "Read" access
3. **Set expiration dates** - For security, set tokens to expire after a reasonable time
4. **Revoke unused tokens** - If you're not using a token anymore, revoke it in your settings

## Troubleshooting

### Token Not Working?

1. **Check if token is set**: `echo $HF_TOKEN`
2. **Verify token format**: Should start with `hf_` and be about 37 characters long
3. **Check token permissions**: Make sure it has "Read" access
4. **Check token expiration**: If you set an expiration date, make sure it hasn't expired
5. **Restart your terminal/server**: After setting environment variables, restart your development server

### Still Getting 401 Errors?

1. Make sure the token is set before starting your Next.js server
2. If using `.env.local`, restart your dev server: `npm run dev`
3. Check that the token hasn't been revoked in your Hugging Face settings
4. Try generating a new token

## Quick Reference

- **Token Settings**: https://huggingface.co/settings/tokens
- **Create New Token**: https://huggingface.co/settings/tokens/new
- **Documentation**: https://huggingface.co/docs/hub/security-tokens

