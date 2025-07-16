// tests/integration/jira/globalSetup.ts
import axios from 'axios';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';

// This function will be executed once before all tests
export async function setup() {
  console.log('Executing global setup: Fetching fresh Jira Access Token...');

  const { JIRA_OAUTH_CLIENT_ID, JIRA_OAUTH_CLIENT_SECRET, JIRA_OAUTH_REFRESH_TOKEN } = process.env;

  if (!JIRA_OAUTH_CLIENT_ID || !JIRA_OAUTH_CLIENT_SECRET || !JIRA_OAUTH_REFRESH_TOKEN) {
    throw new Error('Missing required Jira OAuth environment variables for integration tests.');
  }

  try {
    const response = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'refresh_token',
      client_id: JIRA_OAUTH_CLIENT_ID,
      client_secret: JIRA_OAUTH_CLIENT_SECRET,
      refresh_token: JIRA_OAUTH_REFRESH_TOKEN,
    });

    // Destructure BOTH the new access token and the new refresh token
    const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data;

    if (!newAccessToken || !newRefreshToken) {
      throw new Error('Failed to retrieve access token or new refresh token from response.');
    }

    // Set the fresh access token as an environment variable for the current test run
    process.env.JIRA_OAUTH_ACCESS_TOKEN = newAccessToken;

    // Persist the new refresh token for the next run by updating the .env file
    const envFilePath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envFilePath)) {
      let envFileContent = fs.readFileSync(envFilePath, 'utf-8');
      envFileContent = envFileContent.replace(
        /^JIRA_OAUTH_REFRESH_TOKEN=.*/m,
        `JIRA_OAUTH_REFRESH_TOKEN=${newRefreshToken}`
      );
      fs.writeFileSync(envFilePath, envFileContent);
      console.log('Successfully updated the JIRA_OAUTH_REFRESH_TOKEN in .env file.');
    } else {
        console.warn('Warning: .env file not found. Could not persist new refresh token.');
    }


    console.log('Successfully fetched and set Jira Access Token.');
  } catch (error: any) {
    console.error('Failed to refresh Jira access token:', error.response?.data || error.message);
    throw new Error('Could not setup Jira integration tests. Aborting.');
  }

  // Teardown function (optional, runs after all tests)
  return () => {
    console.log('Global teardown: Test run finished.');
  };
}
