// src/jira_functions/oAuth2/JiraOAuth2Client.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { JiraOAuth2Config, JiraApiError, CreateIssueRequest, CreateIssueResponse, JiraIssue, JiraSearchResponse, IssueLinkRequest, JiraProject, PaginatedResponse, JiraBoard, JiraUser, Logger } from './types';
import { silentLogger } from './util/logger';

// ========= JIRA CLIENT CLASS =========

export default class JiraOAuth2Client {
  private jiraClient: AxiosInstance;
  private agileClient: AxiosInstance;
  private atlassianClient: AxiosInstance;
  private logger: Logger;

  constructor(config: JiraOAuth2Config) {
    const { accessToken, cloudId, apiVersion = '3' } = config;
    const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`;
    this.logger = config.logger || silentLogger;

    // Helper to create a configured client with shared logic
    const createClient = (baseURL: string) => {
      const client = axios.create({
        baseURL,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30000,
      });

      // Add interceptors for logging
      client.interceptors.request.use(
        (req) => {
          this.logger.info(`Jira API Request: ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`);
          return req;
        },
        (error) => {
          this.logger.error('Jira API Request Error:', error);
          return Promise.reject(error);
        },
      );

      client.interceptors.response.use(
        (res) => {
          this.logger.info(`Jira API Response: ${res.status} ${res.config.baseURL}${res.config.url}`);
          return res;
        },
        (error) => {
          this.logger.error('Jira API Response Error: ', {
            status: error.response?.status,
            data: error.response?.data,
            url: `${error.config?.baseURL}${error.config?.url}`,
          });
          return Promise.reject(error);
        },
      );
      return client;
    };

    // Initialize clients for different Jira APIs
    this.jiraClient = createClient(`${baseUrl}/rest/api/${apiVersion}`);
    this.agileClient = createClient(`${baseUrl}/rest/agile/1.0`);
    this.atlassianClient = createClient('https://api.atlassian.com');
  }

  /**
   * Updates the access token for all subsequent requests.
   * Useful for handling OAuth2 token refreshes.
   */
  public setAccessToken(newAccessToken: string): void {
    const authHeader = `Bearer ${newAccessToken}`;
    this.jiraClient.defaults.headers.common['Authorization'] = authHeader;
    this.agileClient.defaults.headers.common['Authorization'] = authHeader;
    this.atlassianClient.defaults.headers.common['Authorization'] = authHeader;
    this.logger.info('Jira client access token has been updated.');
  }

  /**
   * Generic private method to make API calls to a specific client instance.
   */
  private async makeRequest<T = any>(
    client: AxiosInstance,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await client.request({ method, url: endpoint, data, ...config });
      return response.data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.errorMessages?.join(', ') ||
        error.response?.data?.message ||
        error.message ||
        'An unknown Jira API error occurred';

      throw new JiraApiError(
        errorMessage,
        error.response?.status,
        error.response?.statusText,
        error.response?.data,
        error,
      );
    }
  }

  // --- Core Methods (Issues, Projects, etc.) ---

  /**
   * Creates a new issue.
   * (Previously addNewIssue)
   */
  async createIssue(issueData: CreateIssueRequest): Promise<CreateIssueResponse> {
    if (!issueData.fields.project?.key) {
      throw new Error('Missing required field: project.key');
    }
    if (!issueData.fields.issuetype?.name && !issueData.fields.issuetype?.id) {
      throw new Error('Missing required field: issuetype (name or id)');
    }
    if (!issueData.fields.summary) {
      throw new Error('Missing required field: summary');
    }
    return this.makeRequest<JiraIssue>(this.jiraClient, 'POST', '/issue', issueData);
  }

  /**
   * Retrieves an issue by its key.
   * (Previously findIssue)
   */
  async getIssue(issueKey: string, expand?: string[]): Promise<JiraIssue> {
    const params = expand ? { expand: expand.join(',') } : {};
    return this.makeRequest<JiraIssue>(this.jiraClient, 'GET', `/issue/${issueKey}`, undefined, { params });
  }

  /**
   * Updates an existing issue.
   */
  async updateIssue(
    issueKey: string,
    updateData: { fields?: Record<string, any>; update?: Record<string, any> },
  ): Promise<void> {
    return this.makeRequest<void>(this.jiraClient, 'PUT', `/issue/${issueKey}`, updateData);
  }
  
  /**
   * Updates the assignee of an issue.
   */
  async updateAssignee(issueKey: string, accountId: string | null): Promise<void> {
    // To unassign, pass null for accountId. Jira API expects { accountId: null }
    return this.makeRequest<void>(this.jiraClient, 'PUT', `/issue/${issueKey}/assignee`, { accountId });
  }

  /**
   * Searches for issues using JQL.
   */
  async searchIssues(jql: string, options: { fields?: string[]; expand?: string[]; maxResults?: number; startAt?: number } = {}): Promise<JiraSearchResponse> {
    const { fields, expand, maxResults, startAt } = options;
    const params: any = { jql };
    if (fields) params.fields = fields.join(',');
    if (expand) params.expand = expand.join(',');
    if (maxResults) params.maxResults = maxResults;
    if (startAt) params.startAt = startAt;
    
    return this.makeRequest<JiraSearchResponse>(this.jiraClient, 'GET', '/search', undefined, { params });
  }
  
  /**
   * Searches for all Epics in a given project.
   */
  async getEpics(projectKey: string): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND issuetype = Epic`;
    const result = await this.searchIssues(jql, { maxResults: 1000 });
    return result.issues;
  }

  /**
   * Adds an attachment to an issue.
   */
  async addAttachment(issueKey: string, filePath: string): Promise<any> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), path.basename(filePath));

    const headers = {
      ...form.getHeaders(),
      'X-Atlassian-Token': 'no-check',
      'Authorization': this.jiraClient.defaults.headers.common['Authorization'],
    };

    try {
      const response = await axios.post(`${this.jiraClient.defaults.baseURL}/issue/${issueKey}/attachments`, form, { headers });
      return response.data;
    } catch (error: any) {
      throw new JiraApiError('Failed to add attachment', error.response?.status, error.response?.statusText, error.response?.data, error);
    }
  }
  
  /**
   * Creates a link between two issues.
   */
  async linkIssues(linkRequest: IssueLinkRequest): Promise<void> {
    return this.makeRequest<void>(this.jiraClient, 'POST', '/issueLink', linkRequest);
  }
  
  // --- Transitions and Workflows ---

  /**
   * Retrieves the available transitions for an issue.
   * (Previously listTransitions)
   */
  async getTransitions(issueKey: string): Promise<{ expand: string; transitions: any[] }> {
    return this.makeRequest(this.jiraClient, 'GET', `/issue/${issueKey}/transitions`);
  }
  
  /**
   * Transitions an issue to a new status.
   */
  async transitionIssue(issueKey: string, transitionId: string, fields?: Record<string, any>, comment?: string): Promise<void> {
    const data: any = {
      transition: { id: transitionId },
    };
    if (fields) {
      data.fields = fields;
    }
    if (comment) {
      data.update = {
        comment: [{ add: { body: comment } }],
      };
    }
    return this.makeRequest<void>(this.jiraClient, 'POST', `/issue/${issueKey}/transitions`, data);
  }
  
  // --- Projects and Schemes ---

  /**
   * Retrieves all projects visible to the user.
   */
  async getProjects(): Promise<JiraProject[]> {
    return this.makeRequest<JiraProject[]>(this.jiraClient, 'GET', '/project/search');
  }
  
  /**
   * Creates a new project. Note: Requires admin permissions.
   */
  async createProject(projectData: Record<string, any>): Promise<JiraProject> {
    return this.makeRequest<JiraProject>(this.jiraClient, 'POST', '/project', projectData);
  }
  
  async getIssueTypeScheme(projectKey: string): Promise<any> {
    return this.makeRequest(this.jiraClient, 'GET', `/project/${projectKey}/issuetypescheme`);
  }

  async getWorkflowScheme(projectKey: string): Promise<any> {
    const res: any = await this.makeRequest(this.jiraClient, 'GET', `/project/${projectKey}`, undefined, { params: { expand: 'workflowScheme' } });
    return res.workflowScheme;
  }
  
  // --- Agile API Methods (Boards) ---
  
  /**
   * Retrieves all boards, paginated.
   */
  async getAllBoards(startAt = 0, maxResults = 50): Promise<PaginatedResponse<JiraBoard>> {
    return this.makeRequest<PaginatedResponse<JiraBoard>>(this.agileClient, 'GET', '/board', undefined, { params: { startAt, maxResults } });
  }
  
  /**
   * Retrieves issues for a specific board, paginated.
   */
  async getIssuesForBoard(boardId: number, options: { startAt?: number; maxResults?: number; jql?: string } = {}): Promise<JiraSearchResponse> {
    return this.makeRequest<JiraSearchResponse>(this.agileClient, 'GET', `/board/${boardId}/issue`, undefined, { params: options });
  }

  // --- User-related Methods ---
  
  /**
   * Retrieves the profile of the current user.
   */
  async getCurrentUser(): Promise<JiraUser> {
    // This uses the global Atlassian API, not the Jira-specific one
    return this.makeRequest<JiraUser>(this.atlassianClient, 'GET', '/me');
  }

  /**
   * Deletes an issue.
   * Note: This is a permanent action.
   */
  async deleteIssue(issueKey: string): Promise<void> {
    return this.makeRequest<void>(this.jiraClient, 'DELETE', `/issue/${issueKey}`);
  }
}
