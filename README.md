# Jira Client for Node.js (OAuth 2.0)

[![npm version](https://badge.fury.io/js/jira-client-oauth2.svg)](https://badge.fury.io/js/jira-client-oauth2)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, promise-based, and fully-typed TypeScript client for the Jira Cloud REST API, using OAuth 2.0 (3LO) for authentication.

This library simplifies interactions with the Jira API by providing a clean, intuitive interface for common operations like creating issues, searching with JQL, managing projects, and more. It handles the underlying Axios requests, error handling, and API endpoints, so you can focus on your application logic.

## Features

-   **OAuth 2.0 (3LO) Ready**: Designed specifically for the modern Jira Cloud authentication method.
-   **Fully Typed**: Written in TypeScript for excellent autocompletion and type safety.
-   **Comprehensive API Coverage**: Wraps the Core Jira, Agile, and global Atlassian APIs.
-   **Promise-Based**: Uses async/await for clean and readable asynchronous code.
-   **Robust Error Handling**: Throws a custom `JiraApiError` with detailed information.
-   **Smart Client Management**: Automatically routes requests to the correct API endpoint (Core, Agile, etc.).
-e   **Token Management**: Includes a method to update the access token for seamless token refreshes.

## Installation

```bash
npm install jira-client-oauth2
```

## Getting Started

To use the client, you first need to obtain an `accessToken` and `cloudId` from your Jira OAuth 2.0 flow.

1.  **Obtain Credentials**: Follow the [Atlassian OAuth 2.0 (3LO) documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) to get an access token for a user.
2.  **Get your Cloud ID**: You can find your `cloudId` by making a GET request to `https://api.atlassian.com/oauth/token/accessible-resources` with a valid access token.

### Basic Usage

```typescript
import { JiraOAuth2Client } from 'jira-client-oauth2';

// Configuration with your credentials
const config = {
  accessToken: 'YOUR_ACCESS_TOKEN',
  cloudId: 'YOUR_CLOUD_ID',
};

const jiraClient = new JiraOAuth2Client(config);

async function main() {
  try {
    // Get the current user's profile
    const currentUser = await jiraClient.getCurrentUser();
    console.log(`Successfully authenticated as: ${currentUser.displayName}`);

    // Create a new issue
    const newIssue = await jiraClient.createIssue({
      fields: {
        project: {
          key: 'PROJ',
        },
        summary: 'This is a test issue from my app!',
        issuetype: {
          name: 'Task',
        },
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This is the issue description.',
                },
              ],
            },
          ],
        },
      },
    });

    console.log(`Created issue: ${newIssue.self}`);

    // Search for all 'Bugs' in a project
    const searchResults = await jiraClient.searchIssues('project = "PROJ" AND issuetype = Bug');
    console.log(`Found ${searchResults.total} bugs.`);

  } catch (error) {
    console.error('An error occurred:', error.message);
    // The error object has more details if it's a JiraApiError
    if (error.isJiraApiError) {
      console.error('Jira API Error Details:', error.details);
    }
  }
}

main();
```

### Handling Token Refreshes

OAuth 2.0 access tokens expire. When you refresh your token, you can easily update the client instance to use the new one for all subsequent requests.

```typescript
// Assume you have a function to refresh your OAuth token
const newAccessToken = await refreshMyOAuthToken();

// Update the client instance
jiraClient.setAccessToken(newAccessToken);

// All future calls will use the new token
const issue = await jiraClient.getIssue('PROJ-123');
```

## API Methods Overview

The client is organized into logical sections based on the Jira API structure.

### Core API (Issues, Projects)

-   `createIssue(issueData)`: Creates a new issue.
-   `getIssue(issueKey, expand?)`: Retrieves an issue by its key.
-   `updateIssue(issueKey, updateData)`: Updates an issue's fields.
-   `updateAssignee(issueKey, accountId)`: Changes the assignee of an issue.
-   `deleteIssue(issueKey)`: Permanently deletes an issue.
-   `searchIssues(jql, options?)`: Searches for issues using a JQL query.
-   `getEpics(projectKey)`: A helper to find all Epics in a project.
-   `addAttachment(issueKey, filePath)`: Attaches a file to an issue.
-   `linkIssues(linkRequest)`: Creates a link between two issues.

### Workflows

-   `getTransitions(issueKey)`: Lists the available workflow transitions for an issue.
-   `transitionIssue(issueKey, transitionId, fields?, comment?)`: Moves an issue to a new status.

### Projects

-   `getProjects()`: Retrieves all projects visible to the user.
-   `createProject(projectData)`: Creates a new project (requires admin permissions).
-   `getIssueTypeScheme(projectKey)`: Gets the issue type scheme for a project.
-   `getWorkflowScheme(projectKey)`: Gets the workflow scheme for a project.

### Agile API (Boards)

-   `getAllBoards(startAt?, maxResults?)`: Retrieves all Agile boards.
-   `getIssuesForBoard(boardId, options?)`: Retrieves issues for a specific board.

### User Management

-   `getCurrentUser()`: Retrieves the profile of the authenticated user.

## Error Handling

The client throws a custom `JiraApiError` when an API request fails. This error object contains detailed information to help with debugging:

-   `.message`: A user-friendly error summary.
-   `.status`: The HTTP status code of the response (e.g., `404`).
-   `.statusText`: The HTTP status text (e.g., `"Not Found"`).
-   `.details`: The original error payload from the Jira API.
-   `.isJiraApiError`: A boolean flag (`true`) to easily identify this error type.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/prompttosoftware/Jira-client-oauth2/issues).

## License

This project is [MIT licensed](https://github.com/prompttosoftware/Jira-client-oauth2/blob/main/LICENSE).
