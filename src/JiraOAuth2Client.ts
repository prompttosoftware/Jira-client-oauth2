// src/jira_functions/oAuth2/JiraOAuth2Client.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { JiraOAuth2Config, JiraApiError, CreateIssueRequest, CreateIssueResponse, JiraIssue, JiraSearchResponse, IssueLinkRequest, JiraProject, JiraUser, Logger, JiraProjectSearchResponse, RefreshTokensResponse, GetIssuesOptions } from './types';
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
   * Gets a new refresh and access token.
  */
  public async refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<RefreshTokensResponse> {
    const response = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    // Destructure BOTH the new access token and the new refresh token
    const { access_token: newAccessToken, refresh_token: newRefreshToken } = response.data;

    if (!newAccessToken || !newRefreshToken) {
      throw new Error('Failed to retrieve access token or new refresh token from response.');
    }

    return response.data;
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
  async getIssue(issueKey: string, options: { expand?: string[]; fields?: string[] } = {}): Promise<JiraIssue> {
    const { expand, fields } = options;
    const params: any = {};
    if (expand) params.expand = expand.join(',');
    if (fields) params.fields = fields.join(',');
    
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
   * Searches for all Epics for a given project.
   */
  async getEpics(projectKey: string): Promise<JiraIssue[]> {
    const allEpics: JiraIssue[] = [];
    let startAt = 0;
    let isLast = false;
    const MAX_RESULTS = 1000;
    const jql = `project = "${projectKey}" AND issuetype = Epic`;
    
    while (!isLast) {
      const result = await this.searchIssues(jql, { maxResults: MAX_RESULTS });
      
      if (result.issues && result.issues.length > 0) {
        allEpics.push(...result.issues);
      }
      
      isLast = result.issues.length < MAX_RESULTS;
      if (!isLast) {
        startAt = startAt + MAX_RESULTS;
      }
    }
    
    return allEpics;
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
    const response = await this.makeRequest<JiraProjectSearchResponse>(this.jiraClient, 'GET', '/project/search');
    return response.values;
  }

  /**
   * Retrieves a single project by its key or ID.
   */
  async getProject(projectKeyOrId: string): Promise<JiraProject> {
    return this.makeRequest<JiraProject>(this.jiraClient, 'GET', `/project/${projectKeyOrId}`);
  }
  
  /**
   * Creates a new project. Note: Requires admin permissions.
   */
  async createProject(projectData: Record<string, any>): Promise<JiraProject> {
    return this.makeRequest<JiraProject>(this.jiraClient, 'POST', '/project', projectData);
  }

  /**
   * Searches for all Issues for a given project.
   */
  async getIssuesForProject(
    projectKey: number, 
    options: GetIssuesOptions = {}
  ): Promise<JiraIssue[]> {
    const { 
      startAt: initialStartAt = 0, 
      maxResults: userMaxResults, 
      fields,
      jql: additionalJql 
    } = options;
    
    const allIssues: JiraIssue[] = [];
    let startAt = initialStartAt;
    let isLast = false;
    const MAX_RESULTS = userMaxResults || 1000;
    
    // Build JQL query - combine project filter with additional JQL if provided
    let jql = `project = "${projectKey}"`;
    if (additionalJql) {
      jql = `${jql} AND (${additionalJql})`;
    }
    
    // If user specified maxResults, we only fetch that many results total
    const shouldFetchAll = !userMaxResults;
    let remainingResults = userMaxResults || Infinity;
    
    while (!isLast && remainingResults > 0) {
      const currentMaxResults = shouldFetchAll 
        ? MAX_RESULTS 
        : Math.min(MAX_RESULTS, remainingResults);
        
      const searchOptions: any = { 
        startAt, 
        maxResults: currentMaxResults 
      };
      
      if (fields && fields.length > 0) {
        searchOptions.fields = fields;
      }
      
      const result = await this.searchIssues(jql, searchOptions);
      
      if (result.issues && result.issues.length > 0) {
        allIssues.push(...result.issues);
      }
      
      if (shouldFetchAll) {
        // Original behavior - fetch all results
        isLast = result.issues.length < currentMaxResults;
        if (!isLast) {
          startAt = startAt + currentMaxResults;
        }
      } else {
        // User specified maxResults - respect the limit
        remainingResults -= result.issues.length;
        isLast = result.issues.length < currentMaxResults || remainingResults <= 0;
        if (!isLast && remainingResults > 0) {
          startAt = startAt + currentMaxResults;
        }
      }
    }
    
    return allIssues;
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
