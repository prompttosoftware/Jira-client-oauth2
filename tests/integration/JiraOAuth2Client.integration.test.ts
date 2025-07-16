// tests/integration/JiraOAuth2Client.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JiraOAuth2Client } from '../../src/JiraOAuth2Client';

// Use a shared client instance across both test suites
let client: JiraOAuth2Client;
const { JIRA_CLOUD_ID, JIRA_OAUTH_ACCESS_TOKEN, JIRA_TEST_PROJECT_KEY } = process.env;

// This will run once before all tests in this file
beforeAll(() => {
  if (!JIRA_CLOUD_ID || !JIRA_OAUTH_ACCESS_TOKEN || !JIRA_TEST_PROJECT_KEY) {
    throw new Error('Missing required environment variables for Jira integration tests. Did globalSetup run correctly?');
  }

  client = new JiraOAuth2Client({
    cloudId: JIRA_CLOUD_ID,
    accessToken: JIRA_OAUTH_ACCESS_TOKEN,
    apiVersion: '3',
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
    const issueWithLinks = await client.getIssue(createdIssueKey, ['issuelinks']);
    expect(issueWithLinks.fields.issuelinks).toBeDefined();
    expect(issueWithLinks.fields.issuelinks.length).toBeGreaterThan(0);
    const link = issueWithLinks.fields.issuelinks.find(l => l.outwardIssue?.key === secondIssue.key);
    expect(link).toBeDefined();
    expect(link.type.name).toBe('Relates');
    console.log('Successfully verified issue link.');
  });

  it('should add an attachment to the issue', async () => {
    const filePath = path.join(__dirname, 'test-attachment.txt');
    fs.writeFileSync(filePath, 'This is a test attachment file.');

    const response = await client.addAttachment(createdIssueKey, filePath);
    fs.unlinkSync(filePath); // Clean up file

    expect(response).toBeDefined();
    expect(Array.isArray(response)).toBe(true);
    expect(response[0].filename).toBe('test-attachment.txt');
    console.log(`Added attachment "${response[0].filename}" to ${createdIssueKey}`);
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
  
  it('should retrieve project schemes', async () => {
    const issueTypeScheme = await client.getIssueTypeScheme(JIRA_TEST_PROJECT_KEY!);
    expect(issueTypeScheme).toBeDefined();
    expect(issueTypeScheme.name).toBeTypeOf('string');

    const workflowScheme = await client.getWorkflowScheme(JIRA_TEST_PROJECT_KEY!);
    expect(workflowScheme).toBeDefined();
    expect(workflowScheme.name).toBeTypeOf('string');

    console.log(`Retrieved schemes for project ${JIRA_TEST_PROJECT_KEY}.`);
  });

  it('should retrieve all agile boards', async () => {
    const boardsResponse = await client.getAllBoards();
    expect(boardsResponse).toBeDefined();
    expect(Array.isArray(boardsResponse.values)).toBe(true);
    console.log(`Found ${boardsResponse.total || boardsResponse.values.length} agile boards.`);
    
    // If boards exist, test getting issues for the first one
    if (boardsResponse.values.length > 0) {
      const firstBoard = boardsResponse.values[0];
      console.log(`Testing getIssuesForBoard on board "${firstBoard.name}" (ID: ${firstBoard.id})`);
      const issuesForBoard = await client.getIssuesForBoard(firstBoard.id, { maxResults: 1 });
      expect(issuesForBoard).toBeDefined();
      expect(Array.isArray(issuesForBoard.issues)).toBe(true);
      console.log(`Successfully retrieved issues for board ${firstBoard.id}.`);
    } else {
      console.warn('Skipping getIssuesForBoard test because no agile boards were found.');
    }
  });
});
