// tests/integration/jira/setAccessToken.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import 'dotenv/config';
import JiraOAuth2Client from '../../src/JiraOAuth2Client';
import { ConsoleLogger } from './jira/ConsoleLogger';
import path from 'path';
import fs from 'fs';

async function refreshTokensOnce() {
  const { JIRA_OAUTH_CLIENT_ID, JIRA_OAUTH_CLIENT_SECRET, JIRA_OAUTH_REFRESH_TOKEN } = process.env;
  if (!JIRA_OAUTH_CLIENT_ID || !JIRA_OAUTH_CLIENT_SECRET || !JIRA_OAUTH_REFRESH_TOKEN) {
    throw new Error('Missing Jira OAuth env vars');
  }

  const { data } = await axios.post('https://auth.atlassian.com/oauth/token', {
    grant_type: 'refresh_token',
    client_id: JIRA_OAUTH_CLIENT_ID,
    client_secret: JIRA_OAUTH_CLIENT_SECRET,
    refresh_token: JIRA_OAUTH_REFRESH_TOKEN,
  });

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  };
}

const { JIRA_CLOUD_ID } = process.env;
let currentRefreshToken: string | undefined;

// This will run once before all tests in this file
beforeAll(() => {
  if (!JIRA_CLOUD_ID) {
    throw new Error('Missing required environment variables for Jira integration tests. Did globalSetup run correctly?');
  }
});

afterAll(() => {
    // Persist the new refresh token for the next run by updating the .env file
    const envFilePath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envFilePath)) {
        let envFileContent = fs.readFileSync(envFilePath, 'utf-8');
        envFileContent = envFileContent.replace(
        /^JIRA_OAUTH_REFRESH_TOKEN=.*/m,
        `JIRA_OAUTH_REFRESH_TOKEN=${currentRefreshToken}`
        );
        fs.writeFileSync(envFilePath, envFileContent);
        console.log('Successfully updated the JIRA_OAUTH_REFRESH_TOKEN in .env file.');
    } else {
        console.warn('Warning: .env file not found. Could not persist new refresh token.');
    }
});

describe('JiraOAuth2Client - setAccessToken()', () => {
  it('should accept a new access token and rotate the refresh token', async () => {
    // 1. Remember the refresh token we started with
    const originalRefreshToken = process.env.JIRA_OAUTH_REFRESH_TOKEN!;

    // 2. Get a fresh token pair
    const { accessToken, refreshToken: newRefreshToken } = await refreshTokensOnce();

    currentRefreshToken = newRefreshToken;

    // 3. New refresh token must differ from the original
    expect(newRefreshToken).not.toBe(originalRefreshToken);

    // 4. Continue with the access-token test
    const client = new JiraOAuth2Client({
        cloudId: JIRA_CLOUD_ID!,
        accessToken: process.env.JIRA_OAUTH_ACCESS_TOKEN!,
        apiVersion: '3',
        logger: new ConsoleLogger()
      });
    client.setAccessToken(accessToken);

    const user = await client.getCurrentUser();
    expect(user).toBeDefined();
    expect(typeof user.account_id).toBe('string');
  });
});
