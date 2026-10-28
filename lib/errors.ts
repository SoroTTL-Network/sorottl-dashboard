/**
 * Custom error hierarchy for SoroTTL Dashboard API Client and Server Proxy.
 */

export class ApiClientError extends Error {
  readonly code: string;

  constructor(message: string, code = "API_CLIENT_ERROR") {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiHttpError extends ApiClientError {
  readonly status: number;
  readonly backendCode?: string;

  constructor(status: number, message: string, backendCode?: string) {
    super(message, backendCode || `HTTP_${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.backendCode = backendCode;
  }
}

export class ApiValidationError extends ApiClientError {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message, "SCHEMA_VALIDATION_ERROR");
    this.name = "ApiValidationError";
    this.issues = issues;
  }
}

export class ApiTimeoutError extends ApiClientError {
  constructor(message = "Request timed out") {
    super(message, "REQUEST_TIMEOUT");
    this.name = "ApiTimeoutError";
  }
}

export class ApiNetworkError extends ApiClientError {
  constructor(message = "Network error occurred") {
    super(message, "NETWORK_ERROR");
    this.name = "ApiNetworkError";
  }
}
