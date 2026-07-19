/**
 * Typed API client for the Krypts DRM backend.
 * All requests attach the Bearer token from localStorage automatically.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name?: string;
  account_status: "active" | "suspended" | "banned";
  created_at: string;
  last_login_time?: string;
  is_admin?: boolean;
  has_keys?: boolean;
}

export interface FileUploadResponse {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  status: string;
  upload_date: string;
  watermark_enabled: boolean;
  allow_download: boolean;
  is_e2ee?: boolean;
}

export interface FileListResponse extends FileUploadResponse {
  access_count: number;
}

export interface GenerateTokenRequest {
  file_id: string;
  expires_in?: string;
  ip_restriction?: string;
  permissions?: Record<string, boolean>;
}

export interface GenerateTokenResponse {
  token: string;
  expires_at: string;
  id: string;
  file_id: string;
}

export interface ApiKeyResponse {
  id: string;
  key_prefix: string;
  label: string;
  environment: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
  raw_key?: string;
}

export interface UsageAnalytics {
  total_files: number;
  total_tokens_issued: number;
  total_access_events: number;
  blocked_attempts: number;
  bandwidth_saved_mb: number;
  recent_events: Array<{
    id: string;
    event_type: string;
    timestamp: string;
    ip_address?: string;
  }>;
  auth_data?: Array<Record<string, any>>;
  content_data?: Array<Record<string, any>>;
  geo_data?: Array<Record<string, any>>;
}

export interface SecurityEventItem {
  alert_id: string;
  alert_type: string;
  description: string;
  timestamp: string;
  status: string;
  ip_address?: string;
}

export interface AdminUserResponse {
  id: string;
  email: string;
  full_name?: string;
  account_status: string;
  warning_count: number;
  suspension_count: number;
  rapid_session_count: number;
  created_at: string;
  last_login_time?: string;
  risk_score: number;
}

export interface ActivityLogResponse {
  log_id: string;
  event_type: string;
  timestamp: string;
  ip_address?: string;
  device_info?: string;
  login_duration?: number;
  session_id?: string;
}

export interface SecurityAlertResponse {
  alert_id: string;
  user_id: string;
  alert_type: string;
  description: string;
  timestamp: string;
  status: string;
  ip_address?: string;
}

export interface GroupResponse {
  group_id: string;
  owner_id: string;
  name: string;
  description?: string;
  member_count: number;
}

export interface GroupFileResponse {
  share_id: string;
  file_id: string;
  filename: string;
  content_type: string;
  shared_by_email: string;
  shared_at: string;
}

export interface InboxItem {
  share_id: string;
  file_id: string;
  filename: string;
  content_type: string;
  shared_by_name: string;
  shared_by_email: string;
  shared_at: string;
  access_token: string;
  is_e2ee?: boolean;
}

export interface KeyBundleResponse {
  public_key?: string;
  encrypted_private_key?: string;
  key_salt?: string;
  has_keys: boolean;
}

export interface PublicKeyResponse {
  email: string;
  public_key: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  file_id?: string;
  expires_at?: string;
  permissions?: Record<string, boolean>;
  is_e2ee?: boolean;
  message?: string;
}

export interface GroupInviteResponse {
  invite_id: string;
  group_id: string;
  group_name: string;
  invited_by_name: string;
  invited_by_email: string;
  created_at: string;
  status: string;
}

export interface GroupMemberResponse {
  user_id: string;
  email: string;
  full_name?: string;
  role: string;
  joined_at: string;
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string>),
  };

  // Don't set Content-Type for FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      detail = json.detail || detail;
    } catch {}
    const err = new Error(`[HTTP ${res.status}] ${detail}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json();
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    signup: (
      email: string,
      password: string,
      fullName?: string,
      keyBundle?: { public_key: string; encrypted_private_key: string; key_salt: string }
    ) =>
      apiFetch<TokenResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name: fullName, ...keyBundle }),
      }),

    login: (email: string, password: string) =>
      apiFetch<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    me: () => apiFetch<UserResponse>("/auth/me"),

    logout: () =>
      apiFetch<{ detail: string }>("/auth/logout", { method: "POST" }),

    getKeys: () => apiFetch<KeyBundleResponse>("/auth/keys"),

    setKeys: (
      publicKey: string,
      encryptedPrivateKey: string,
      keySalt: string,
      force = false
    ) =>
      apiFetch<KeyBundleResponse>("/auth/keys", {
        method: "POST",
        body: JSON.stringify({
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
          key_salt: keySalt,
          force,
        }),
      }),
  },

  files: {
    upload: (formData: FormData) =>
      apiFetch<FileUploadResponse>("/upload", {
        method: "POST",
        body: formData,
      }),

    list: () => apiFetch<FileListResponse[]>("/files"),

    delete: (fileId: string) =>
      apiFetch<{ message: string; file_id: string }>(`/file/${fileId}`, {
        method: "DELETE",
      }),
  },

  tokens: {
    generate: (req: GenerateTokenRequest) =>
      apiFetch<GenerateTokenResponse>("/generate-token", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    validate: (token: string, fileId?: string) =>
      apiFetch<ValidateTokenResponse>("/validate-token", {
        method: "POST",
        body: JSON.stringify({ token, file_id: fileId }),
      }),
  },

  analytics: {
    usage: () => apiFetch<UsageAnalytics>("/analytics/usage"),
    securityEvents: (limit = 20) =>
      apiFetch<SecurityEventItem[]>(`/analytics/security-events?limit=${limit}`),
    submitTelemetry: (eventType: string, data: Record<string, any>) =>
      apiFetch("/analytics/telemetry", {
        method: "POST",
        body: JSON.stringify({ event_type: eventType, data }),
      }),
  },

  apiKeys: {
    list: () => apiFetch<ApiKeyResponse[]>("/apikey/list"),

    create: (label: string, environment: string) =>
      apiFetch<ApiKeyResponse>("/apikey/create", {
        method: "POST",
        body: JSON.stringify({ label, environment }),
      }),

    revoke: (keyId: string) =>
      apiFetch("/apikey/revoke", {
        method: "POST",
        body: JSON.stringify({ key_id: keyId }),
      }),
  },

  admin: {
    users: () => apiFetch<AdminUserResponse[]>("/admin/users"),

    userActivity: (userId: string) =>
      apiFetch<ActivityLogResponse[]>(`/admin/user/${userId}/activity`),

    banUser: (userId: string) =>
      apiFetch(`/admin/user/${userId}/ban`, { method: "POST" }),

    suspendUser: (userId: string) =>
      apiFetch(`/admin/user/${userId}/suspend`, { method: "POST" }),

    reactivateUser: (userId: string) =>
      apiFetch(`/admin/user/${userId}/reactivate`, { method: "POST" }),

    securityAlerts: () =>
      apiFetch<SecurityAlertResponse[]>("/admin/security-alerts"),

    markAlertRead: (alertId: string) =>
      apiFetch(`/admin/security-alerts/${alertId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "read" }),
      }),
  },

  groups: {
    list: () => apiFetch<GroupResponse[]>("/groups"),
    create: (name: string, description?: string) =>
      apiFetch<GroupResponse>("/groups", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      }),
    inviteMember: (groupId: string, email: string) =>
      apiFetch(`/groups/${groupId}/invite`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    getMembers: (groupId: string) =>
      apiFetch<GroupMemberResponse[]>(`/groups/${groupId}/members`),
    getFiles: (groupId: string) =>
      apiFetch<GroupFileResponse[]>(`/groups/${groupId}/files`),
    deleteFile: (groupId: string, shareId: string) =>
      apiFetch(`/groups/${groupId}/files/${shareId}`, { method: "DELETE" }),
  },

  inbox: {
    list: () => apiFetch<InboxItem[]>("/inbox"),
    share: (fileId: string, targetEmail?: string, targetGroupId?: string, wrappedDek?: string) =>
      apiFetch("/inbox/share", {
        method: "POST",
        body: JSON.stringify({
          file_id: fileId,
          target_email: targetEmail,
          target_group_id: targetGroupId,
          wrapped_dek: wrappedDek,
        }),
      }),
  },

  invites: {
    list: () => apiFetch<GroupInviteResponse[]>("/invites"),
    accept: (inviteId: string) =>
      apiFetch(`/invites/${inviteId}/accept`, { method: "POST" }),
    reject: (inviteId: string) =>
      apiFetch(`/invites/${inviteId}/reject`, { method: "POST" }),
  },

  e2ee: {
    getPubkey: (email: string) =>
      apiFetch<PublicKeyResponse>(`/e2ee/pubkey?email=${encodeURIComponent(email)}`),

    getFileKey: (fileId: string) =>
      apiFetch<{ file_id: string; wrapped_dek: string; client_iv: string }>(`/e2ee/filekey/${fileId}`),

    blobUrl: (fileId: string, token: string) =>
      `${API_BASE}/e2ee/blob/${fileId}?token=${encodeURIComponent(token)}`,
  },
};

export { API_BASE };
