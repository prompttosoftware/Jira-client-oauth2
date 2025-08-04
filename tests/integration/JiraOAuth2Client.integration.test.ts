// tests/integration/JiraOAuth2Client.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import JiraOAuth2Client from '../../src/JiraOAuth2Client';
import { ConsoleLogger } from './jira/ConsoleLogger';

// Use a shared client instance across both test suites
let client: JiraOAuth2Client;
const { JIRA_CLOUD_ID, JIRA_OAUTH_ACCESS_TOKEN, JIRA_TEST_PROJECT_KEY, JIRA_TEST_BOARD_ID } = process.env;

// This will run once before all tests in this file
beforeAll(() => {
  if (!JIRA_CLOUD_ID || !JIRA_OAUTH_ACCESS_TOKEN || !JIRA_TEST_PROJECT_KEY || !JIRA_TEST_BOARD_ID) {
    throw new Error('Missing required environment variables for Jira integration tests. Did globalSetup run correctly?');
  }

  client = new JiraOAuth2Client({
    cloudId: JIRA_CLOUD_ID,
    accessToken: JIRA_OAUTH_ACCESS_TOKEN,
    apiVersion: '3',
    logger: new ConsoleLogger()
  });
});

// === SUITE 1: Sequential Issue Lifecycle Tests ===
// These tests depend on each other and must run in order to test the full lifecycle of an issue.
describe.sequential('JiraOAuth2Client - Issue Lifecycle Integration Tests', () => {
  let createdIssueKey: string;
  let currentUserAccountId: string;
  const issuesToDelete: string[] = []; // Track all created issues for cleanup

  // After all tests have run, clean up by deleting all created issues
  afterAll(async () => {
    if (issuesToDelete.length > 0) {
      console.log(`Cleaning up ${issuesToDelete.length} test issue(s)...`);
      for (const issueKey of issuesToDelete) {
        try {
          console.log(`- Deleting issue ${issueKey}...`);
          await client.deleteIssue(issueKey);
          console.log(`  Successfully deleted issue ${issueKey}.`);
        } catch (error) {
          console.error(`  Failed to clean up issue ${issueKey}:`, error);
        }
      }
    }
  });

  it('should get the current authenticated user', async () => {
    const user = await client.getCurrentUser();
    expect(user).toBeDefined();
    expect(user.account_id).toBeTypeOf('string');
    currentUserAccountId = user.account_id; // Save for the assignee test
    console.log(`Authenticated as: ${user.name} (${user.account_id})`);
  });

  it('should create a new issue', async () => {
    const issueData = {
      fields: {
        project: { key: JIRA_TEST_PROJECT_KEY },
        issuetype: { name: 'Task' },
        summary: `[TEST] Integration Test Issue - ${new Date().toISOString()}`,
        description: {
          type: 'doc', version: 1, content: [{
            type: 'paragraph', content: [{ type: 'text', text: 'This is an automated test issue.' }]
          }]
        },
      },
    };

    const newIssue = await client.createIssue(issueData);
    expect(newIssue).toBeDefined();
    expect(newIssue.key).toContain(`${JIRA_TEST_PROJECT_KEY}-`);

    createdIssueKey = newIssue.key;
    issuesToDelete.push(createdIssueKey); // Add to cleanup list
    console.log(`Created issue: ${createdIssueKey}`);
  });

  it('should retrieve the created issue', async () => {
    const issue = await client.getIssue(createdIssueKey);
    expect(issue).toBeDefined();
    expect(issue.id).toBeTypeOf('string');
    expect(issue.key).toBe(createdIssueKey);
  });

  it('should retrieve issue with specific fields and expand options', async () => {
    const issue = await client.getIssue(createdIssueKey, {
      fields: ['summary', 'status', 'assignee'],
      expand: ['changelog']
    });
    expect(issue).toBeDefined();
    expect(issue.key).toBe(createdIssueKey);
    expect(issue.fields.summary).toBeDefined();
    expect(issue.fields.status).toBeDefined();
    console.log(`Retrieved issue with specific fields: ${issue.fields.summary}`);
  });

  it('should update the issue summary', async () => {
    const newSummary = `[TEST] Updated Summary - ${new Date().toISOString()}`;
    await client.updateIssue(createdIssueKey, { fields: { summary: newSummary } });
    const updatedIssue = await client.getIssue(createdIssueKey);
    expect(updatedIssue.fields.summary).toBe(newSummary);
    console.log(`Updated issue summary to: "${newSummary}"`);
  });
  
  it('should update the assignee of the issue', async () => {
    // Assign the issue to the current user
    console.log(`Assigning issue ${createdIssueKey} to user ${currentUserAccountId}`);
    await client.updateAssignee(createdIssueKey, currentUserAccountId);
    let issue = await client.getIssue(createdIssueKey);
    expect(issue.fields.assignee).toBeDefined();
    expect(issue.fields.assignee.accountId).toBe(currentUserAccountId);
    console.log(`Successfully assigned issue.`);
    
    // Unassign the issue
    console.log(`Unassigning issue ${createdIssueKey}`);
    await client.updateAssignee(createdIssueKey, null);
    issue = await client.getIssue(createdIssueKey);
    expect(issue.fields.assignee).toBeNull();
    console.log(`Successfully unassigned issue.`);
  });
  
  it('should link the issue to another issue', async () => {
    // 1. Create a second issue to link to
    const secondIssueData = {
      fields: {
        project: { key: JIRA_TEST_PROJECT_KEY },
        issuetype: { name: 'Task' },
        summary: `[TEST] Second Issue for Linking - ${new Date().toISOString()}`,
      },
    };
    const secondIssue = await client.createIssue(secondIssueData);
    issuesToDelete.push(secondIssue.key); // Ensure it gets cleaned up
    console.log(`Created second issue for linking: ${secondIssue.key}`);

    // 2. Link the issues
    await client.linkIssues({
      type: { name: 'Relates' }, // 'Relates' is a common, safe link type
      inwardIssue: { key: createdIssueKey },
      outwardIssue: { key: secondIssue.key },
    });
    console.log(`Linked ${createdIssueKey} and ${secondIssue.key}`);

    // 3. Verify the link exists
    const issueWithLinks = await client.getIssue(createdIssueKey, {expand: ['issuelinks']});
    expect(issueWithLinks.fields.issuelinks).toBeDefined();
    expect(issueWithLinks.fields.issuelinks.length).toBeGreaterThan(0);
    const link = issueWithLinks.fields.issuelinks.find(l => l.outwardIssue?.key === secondIssue.key);
    expect(link).toBeDefined();
    expect(link.type.name).toBe('Relates');
    console.log('Successfully verified issue link.');
  });
  
  it('should transition the issue (if workflow allows)', async () => {
    const transitions = await client.getTransitions(createdIssueKey);
    const inProgressTransition = transitions.transitions.find(t => t.name.toLowerCase() === 'in progress');

    if (inProgressTransition) {
        console.log(`Found 'In Progress' transition (ID: ${inProgressTransition.id}). Attempting to transition...`);
        await client.transitionIssue(createdIssueKey, inProgressTransition.id);
        const issueAfterTransition = await client.getIssue(createdIssueKey);
        expect(issueAfterTransition.fields.status.name).toBe('In Progress');
        console.log(`Successfully transitioned issue to 'In Progress'.`);
    } else {
        console.warn("Skipping transition test: 'In Progress' transition not available from current status.");
        expect(true).toBe(true);
    }
  });

  it('should transition issue with fields and comment', async () => {
    const transitions = await client.getTransitions(createdIssueKey);
    console.log(`Available transitions: ${transitions.transitions.map(t => t.name).join(', ')}`);
    
    // Try to find a transition that allows us to add fields/comments
    const availableTransition = transitions.transitions[0]; // Use first available transition
    
    if (availableTransition) {
      console.log(`Testing transition with comment using: ${availableTransition.name}`);
      await client.transitionIssue(
        createdIssueKey, 
        availableTransition.id, 
        {}, // No additional fields in this test
        'This is a test comment added during transition'
      );
      console.log(`Successfully transitioned with comment.`);
      
      // Verify the transition happened (status might have changed)
      const issue = await client.getIssue(createdIssueKey);
      expect(issue).toBeDefined();
    } else {
      console.warn('No transitions available for testing transition with comment');
      expect(true).toBe(true);
    }
  });
});

// === SUITE 2: Independent Read/Search Tests ===
// These tests do not depend on each other and can run in parallel.
// They test read-only methods or methods that don't require a specific created resource.
describe('JiraOAuth2Client - Independent Integration Tests', () => {

  it('should search for issues using JQL', async () => {
    const jql = `project = "${JIRA_TEST_PROJECT_KEY}" ORDER BY created DESC`;
    const response = await client.searchIssues(jql, { maxResults: 5 });

    expect(response).toBeDefined();
    expect(response.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.issues)).toBe(true);
    console.log(`JQL search found ${response.total} issues in project ${JIRA_TEST_PROJECT_KEY}.`);
  });

  it('should search for issues with specific fields and expand options', async () => {
    const jql = `project = "${JIRA_TEST_PROJECT_KEY}" ORDER BY created DESC`;
    const response = await client.searchIssues(jql, { 
      maxResults: 3,
      fields: ['summary', 'status'],
      expand: ['changelog'],
      startAt: 0
    });

    expect(response).toBeDefined();
    expect(Array.isArray(response.issues)).toBe(true);
    if (response.issues.length > 0) {
      expect(response.issues[0].fields.summary).toBeDefined();
      expect(response.issues[0].fields.status).toBeDefined();
    }
    console.log(`JQL search with options returned ${response.issues.length} issues.`);
  });

  it('should retrieve epics for the test project', async () => {
    // This test assumes the project might have epics. An empty array is a valid result.
    const epics = await client.getEpics(JIRA_TEST_PROJECT_KEY!);
    expect(epics).toBeDefined();
    expect(Array.isArray(epics)).toBe(true);
    console.log(`Found ${epics.length} epics in project ${JIRA_TEST_PROJECT_KEY}.`);
  });

  it('should retrieve all visible projects', async () => {
    const projects = await client.getProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    const testProject = projects.find(p => p.key === JIRA_TEST_PROJECT_KEY);
    expect(testProject).toBeDefined();
    console.log(`Found test project "${testProject!.name}" (${testProject!.key}) among ${projects.length} total projects.`);
  });

  it('should retrieve a specific project by key', async () => {
    const project = await client.getProject(JIRA_TEST_PROJECT_KEY!);
    expect(project).toBeDefined();
    expect(project.key).toBe(JIRA_TEST_PROJECT_KEY);
    expect(project.name).toBeTypeOf('string');
    expect(project.id).toBeTypeOf('string');
    console.log(`Retrieved project: ${project.name} (${project.key})`);
  });

  it('should retrieve issues for project with default options', async () => {
    const issues = await client.getIssuesForProject(JIRA_TEST_PROJECT_KEY!, {
      maxResults: 5
    });
    expect(Array.isArray(issues)).toBe(true);
    console.log(`Retrieved ${issues.length} issues for project ${JIRA_TEST_PROJECT_KEY}.`);
    
    // Verify all issues belong to the correct project
    issues.forEach(issue => {
      expect(issue.key).toContain(`${JIRA_TEST_PROJECT_KEY}-`);
    });
  });

  it('should retrieve issues for project with specific fields', async () => {
    const issues = await client.getIssuesForProject(JIRA_TEST_PROJECT_KEY!, {
      maxResults: 3,
      fields: ['summary', 'status', 'assignee']
    });
    expect(Array.isArray(issues)).toBe(true);
    
    if (issues.length > 0) {
      expect(issues[0].fields.summary).toBeDefined();
      expect(issues[0].fields.status).toBeDefined();
      // assignee might be null, but the field should exist
      expect('assignee' in issues[0].fields).toBe(true);
    }
    console.log(`Retrieved ${issues.length} issues with specific fields.`);
  });

  it('should retrieve issues for project with additional JQL', async () => {
    const issues = await client.getIssuesForProject(JIRA_TEST_PROJECT_KEY!, {
      maxResults: 5,
      jql: 'summary ~ "TEST"'
    });
    expect(Array.isArray(issues)).toBe(true);
    console.log(`Retrieved ${issues.length} issues matching additional JQL filter.`);
    
    // Verify all issues contain "TEST" in summary (if any found)
    issues.forEach(issue => {
      expect(issue.fields.summary.toUpperCase()).toContain('TEST');
    });
  });

  it('should retrieve issues for project with startAt offset', async () => {
    const firstBatch = await client.getIssuesForProject(JIRA_TEST_PROJECT_KEY!, {
      maxResults: 2,
      startAt: 0
    });
    
    const secondBatch = await client.getIssuesForProject(JIRA_TEST_PROJECT_KEY!, {
      maxResults: 2,
      startAt: 2
    });
    
    expect(Array.isArray(firstBatch)).toBe(true);
    expect(Array.isArray(secondBatch)).toBe(true);
    
    // If we have enough issues, the batches should be different
    if (firstBatch.length > 0 && secondBatch.length > 0) {
      expect(firstBatch[0].key).not.toBe(secondBatch[0].key);
    }
    
    console.log(`First batch: ${firstBatch.length} issues, Second batch: ${secondBatch.length} issues`);
  });
});

// === SUITE 3: Token and Client Management Tests ===
describe('JiraOAuth2Client - Token and Client Management Tests', () => {
  
  it('should update access token successfully', async () => {
    const originalToken = JIRA_OAUTH_ACCESS_TOKEN!;
    
    // Set a new token (same token for testing purposes)
    client.setAccessToken(originalToken);
    
    // Verify the client still works with the "new" token
    const user = await client.getCurrentUser();
    expect(user).toBeDefined();
    expect(user.account_id).toBeTypeOf('string');
    console.log('Successfully updated and tested access token.');
  });

  // Note: We can't easily test refreshAccessToken without valid refresh credentials
  // This would require a separate test setup with refresh token management
  it('should handle refresh token method (structure test)', async () => {
    // This tests that the method exists and has the right signature
    expect(typeof client.refreshAccessToken).toBe('function');
    
    // We can't actually test the refresh without valid credentials
    // In a real scenario, you'd need:
    // const refreshResponse = await client.refreshAccessToken(clientId, clientSecret, refreshToken);
    console.log('Refresh token method structure verified.');
  });
});

// === SUITE 4: Error Handling and Edge Cases ===
describe('JiraOAuth2Client - Error Handling Tests', () => {
  
  it('should handle creating issue with missing required fields', async () => {
    const invalidIssueData = {
      fields: {
        // Missing required project field
        issuetype: { name: 'Task' },
        summary: 'Test issue',
      },
    };

    await expect(client.createIssue(invalidIssueData as any))
      .rejects
      .toThrow(/Missing required field: project.key/);
    console.log('Correctly rejected issue creation with missing project key.');
  });

  it('should handle creating issue with missing issuetype', async () => {
    const invalidIssueData = {
      fields: {
        project: { key: JIRA_TEST_PROJECT_KEY },
        // Missing required issuetype field
        summary: 'Test issue',
      },
    };

    await expect(client.createIssue(invalidIssueData as any))
      .rejects
      .toThrow(/Missing required field: issuetype/);
    console.log('Correctly rejected issue creation with missing issuetype.');
  });

  it('should handle creating issue with missing summary', async () => {
    const invalidIssueData = {
      fields: {
        project: { key: JIRA_TEST_PROJECT_KEY },
        issuetype: { name: 'Task' },
        // Missing required summary field
      },
    };

    await expect(client.createIssue(invalidIssueData as any))
      .rejects
      .toThrow(/Missing required field: summary/);
    console.log('Correctly rejected issue creation with missing summary.');
  });

  it('should handle non-existent issue key', async () => {
    const fakeIssueKey = `${JIRA_TEST_PROJECT_KEY}-999999`;
    
    await expect(client.getIssue(fakeIssueKey))
      .rejects
      .toThrow();
    console.log('Correctly handled request for non-existent issue.');
  });

  it('should handle non-existent project key', async () => {
    const fakeProjectKey = 'NONEXISTENT';
    
    await expect(client.getProject(fakeProjectKey))
      .rejects
      .toThrow();
    console.log('Correctly handled request for non-existent project.');
  });

  it('should handle invalid JQL syntax', async () => {
    const invalidJql = 'invalid jql syntax here!!!';
    
    await expect(client.searchIssues(invalidJql))
      .rejects
      .toThrow();
    console.log('Correctly handled invalid JQL syntax.');
  });
});

// === SUITE 5: Project Creation Test (if permissions allow) ===
describe('JiraOAuth2Client - Project Creation Tests', { timeout: 60000 }, () => {
  
  it('should handle project creation (or fail gracefully without admin permissions)', async () => {
    const timestamp = Date.now().toString();
    const suffix = timestamp.slice(-6);
    const key = `TP${suffix}`.slice(0, 10).toUpperCase();

    const projectData = {
      key,
      name: `Test Project ${timestamp}`,
      projectTypeKey: 'software',
      description: 'Test project created by integration tests',
      leadAccountId: (await client.getCurrentUser()).account_id
    };

    try {
      const newProject = await client.createProject(projectData);
      expect(newProject).toBeDefined();
      expect(newProject.key).toBe(projectData.key);
      console.log(`Successfully created test project: ${newProject.key}`);

      // Clean-up note
      console.log('Note: Test project cleanup may need to be done manually');
    } catch (error: any) {
      // Same graceful failure handling
      if (error.status === 403 || /admin|permission/i.test(error.message)) {
        console.log('Project creation failed due to insufficient permissions (expected for non-admin users)');
        expect(true).toBe(true);
      } else {
        throw error;
      }
    }
  });
});
