// ========= INTERFACES =========

/**
 * Defines the interface for a logger that can be used by the client.
 * Consumers of the library can provide their own implementation of this interface.
 */
export interface Logger {
  info(message: string, ...meta: any[]): void;
  warn(message: string, ...meta: any[]): void;
  error(message: string, ...meta: any[]): void;
  debug(message: string, ...meta: any[]): void;
}

export interface JiraOAuth2Config {
  cloudId: string;
  accessToken: string;
  apiVersion?: '2' | '3'; // Jira Cloud API version
  logger?: Logger;
}

// --- Entity Interfaces ---
export interface JiraUser {
  account_id: string;
  email?: string;
  name: string;
  picture: string;
  account_status: string;
  last_updated: string;
  locale: string;
  account_type: string;
  emailVerified: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  // ... other project fields
}

export interface RefreshTokensResponse {
  access_token: string;
  refresh_token: string;
}

export interface GetIssuesOptions {
    startAt?: number;
    maxResults?: number;
    fields?: string[];
    jql?: string;
}

export type JiraProjectSearchResponse = {
  values: JiraProject[];
  self: string;
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
};

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    project: JiraProject;
    issuetype: JiraIssueType;
    status: {
      name: string;
      id: string;
    };
    [key: string]: any; // For custom fields
  };
}

export interface CreateIssueResponse {
    id: string;
    key: string;
    self: string;
}

export interface RefreshTokensResponse {
    refreshToken: string;
    accessToken: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  description: string;
  subtask: boolean;
}

export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
}

// --- Request Body Interfaces ---
export interface CreateIssueRequest {
  fields: Record<string, any>;
  update?: Record<string, any>;
}

export interface IssueLinkRequest {
  type: { name: string };
  inwardIssue: { key: string };
  outwardIssue: { key: string };
  comment?: { body: string };
}

// --- Response Wrapper Interfaces ---
export interface JiraSearchResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface PaginatedResponse<T> {
  maxResults: number;
  startAt: number;
  total?: number; // Not always present
  isLast: boolean;
  values: T[];
}

// ========= CUSTOM ERROR =========
export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly responseData?: any,
    public readonly originalError?: any,
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}
