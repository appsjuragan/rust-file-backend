using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace AppsJuragan.SyncClient.Services;
public record UserProfileResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("avatar_url")] string? AvatarUrl
);

public record UserFactsResponse(
    [property: JsonPropertyName("total_files")] long TotalFiles,
    [property: JsonPropertyName("total_size")] long TotalSize,
    [property: JsonPropertyName("video_count")] long VideoCount,
    [property: JsonPropertyName("audio_count")] long AudioCount,
    [property: JsonPropertyName("document_count")] long DocumentCount,
    [property: JsonPropertyName("image_count")] long ImageCount,
    [property: JsonPropertyName("others_count")] long OthersCount,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt
);

// ─── API DTOs ────────────────────────────────────────────────────────────────

public record DeviceCodeResponse(
    [property: JsonPropertyName("device_code")] string DeviceCode,
    [property: JsonPropertyName("user_code")] string UserCode,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("interval")] int Interval,
    [property: JsonPropertyName("verification_uri")] string VerificationUri
);
public record PollTokenResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("token")] string? Token,
    [property: JsonPropertyName("username")] string? Username,
    [property: JsonPropertyName("message")] string Message
);

public record ShareResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("user_file_id")] string UserFileId,
    [property: JsonPropertyName("share_token")] string ShareToken,
    [property: JsonPropertyName("share_type")] string ShareType,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt,
    [property: JsonPropertyName("filename")] string? Filename
);

public class FileMetadata
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("filename")] public string Filename { get; set; } = "";
    [JsonPropertyName("size")] public long? Size { get; set; }
    [JsonPropertyName("mime_type")] public string? MimeType { get; set; }
    [JsonPropertyName("is_folder")] public bool IsFolder { get; set; }
    [JsonPropertyName("parent_id")] public string? ParentId { get; set; }
    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [JsonPropertyName("updated_at")] public DateTimeOffset? UpdatedAt { get; set; }
    [JsonPropertyName("deleted_at")] public DateTimeOffset? DeletedAt { get; set; }
    [JsonPropertyName("is_favorite")] public bool IsFavorite { get; set; }
    [JsonPropertyName("is_shared")] public bool IsShared { get; set; }
    [JsonPropertyName("share_token")] public string? ShareToken { get; set; }
    [JsonPropertyName("hash")] public string? Hash { get; set; }
    [JsonPropertyName("is_system")] public bool IsSystem { get; set; }
}

public class UploadInitRequest
{
    [JsonPropertyName("file_name")] public string Filename { get; set; } = "";
    [JsonPropertyName("total_size")] public long Size { get; set; }
    [JsonPropertyName("file_type")] public string MimeType { get; set; } = "";
}

public class UploadInitResponse
{
    [JsonPropertyName("upload_id")] public string UploadId { get; set; } = "";
    [JsonPropertyName("chunk_size")] public long PartSize { get; set; }
}

public class CompleteUploadRequest
{
    [JsonPropertyName("parent_id")] public string? ParentId { get; set; }
    [JsonPropertyName("hash")] public string? Hash { get; set; }
}

// ─── API Client ──────────────────────────────────────────────────────────────

/// <summary>Typed HTTP client for all backend API calls.</summary>
public class ApiClient
{
    private readonly HttpClient _http;
    private readonly AuthService _auth;
    private readonly ILogger<ApiClient> _log;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private string _baseUrl;
    public string BaseUrl => _baseUrl;

    public ApiClient(HttpClient http, AuthService auth, SettingsService settings, ILogger<ApiClient> log)
    {
        _http = http;
        _auth = auth;
        _log = log;
        _baseUrl = NormalizeBaseUrl(settings.Current.ServerUrl);
    }

    // ── Device auth flow ─────────────────────────────────────────────────────

    public async Task<DeviceCodeResponse?> InitiateDeviceAuthAsync(CancellationToken ct = default)
    {
        var resp = await _http.PostAsync(_baseUrl + "auth/device", null, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<DeviceCodeResponse>(JsonOpts, ct);
    }

    public async Task<PollTokenResponse?> PollDeviceTokenAsync(string deviceCode, CancellationToken ct = default)
    {
        var resp = await _http.GetAsync($"{_baseUrl}auth/device/token?device_code={Uri.EscapeDataString(deviceCode)}", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<PollTokenResponse>(JsonOpts, ct);
    }

    public async Task<UserProfileResponse?> GetProfileAsync(CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.GetAsync(_baseUrl + "users/me", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<UserProfileResponse>(JsonOpts, ct);
    }

    public async Task<UserFactsResponse?> GetUserFactsAsync(CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.GetAsync(_baseUrl + "users/me/facts", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<UserFactsResponse>(JsonOpts, ct);
    }

    public async Task<List<ShareResponse>> GetFileSharesAsync(string fileId, CancellationToken ct = default)
    {
        SetAuthHeader();
        var url = $"{_baseUrl}shares?user_file_id={Uri.EscapeDataString(fileId)}";
        var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<ShareResponse>>(JsonOpts, ct) ?? [];
    }

    // ── File list ─────────────────────────────────────────────────────────────

    public async Task<List<FileMetadata>> ListFilesAsync(string? parentId = null, CancellationToken ct = default)
    {
        SetAuthHeader();
        var query = parentId == null ? "parent_id=root" : $"parent_id={Uri.EscapeDataString(parentId)}";
        var url = $"{_baseUrl}files?{query}";
        var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<FileMetadata>>(JsonOpts, ct) ?? [];
    }

    public async Task<List<FileMetadata>> GetDeltaAsync(DateTimeOffset since, CancellationToken ct = default)
    {
        SetAuthHeader();
        var url = $"{_baseUrl}files/delta?since={Uri.EscapeDataString(since.ToString("o"))}"; // ISO 8601
        var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<FileMetadata>>(JsonOpts, ct) ?? [];
    }

    public async Task<List<FileMetadata>> GetFolderPathAsync(string folderId, CancellationToken ct = default)
    {
        SetAuthHeader();
        var url = $"{_baseUrl}files/{Uri.EscapeDataString(folderId)}/path";
        var resp = await _http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<FileMetadata>>(JsonOpts, ct) ?? [];
    }

    public async Task<List<FileMetadata>> ListAllFilesRecursiveAsync(CancellationToken ct = default)
    {
        var all = new List<FileMetadata>();
        var queue = new Queue<string?>();
        queue.Enqueue(null); // root

        while (queue.Count > 0)
        {
            var pid = queue.Dequeue();
            var items = await ListFilesAsync(pid, ct);
            
            // Filter out system items (like .Trash) so they are never added to the sync map
            var filteredItems = items.Where(i => !i.IsSystem).ToList();
            all.AddRange(filteredItems);

            foreach (var item in filteredItems.Where(i => i.IsFolder))
                queue.Enqueue(item.Id);
        }
        return all;
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    public async Task<UploadInitResponse?> InitUploadAsync(UploadInitRequest req, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.PostAsJsonAsync(_baseUrl + "files/upload/init", req, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<UploadInitResponse>(JsonOpts, ct);
    }

    public async Task<string> UploadChunkAsync(string uploadId, int partNumber, byte[] data, CancellationToken ct = default)
    {
        SetAuthHeader();
        var content = new ByteArrayContent(data);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        var resp = await _http.PutAsync($"{_baseUrl}files/upload/{uploadId}/chunk/{partNumber}", content, ct);
        resp.EnsureSuccessStatusCode();
        // ETag is in response header
        return resp.Headers.ETag?.Tag?.Trim('"') ?? partNumber.ToString();
    }

    public async Task<FileMetadata?> CompleteUploadAsync(string uploadId, CompleteUploadRequest req, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.PostAsJsonAsync($"{_baseUrl}files/upload/{uploadId}/complete", req, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<FileMetadata>(JsonOpts, ct);
    }

    // ── Download ──────────────────────────────────────────────────────────────

    public async Task DownloadFileAsync(string fileId, string localPath, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.GetAsync($"{_baseUrl}files/{fileId}", HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();

        Directory.CreateDirectory(Path.GetDirectoryName(localPath)!);
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        await using var file = File.Create(localPath);
        await stream.CopyToAsync(file, ct);
    }

    // ── Create folder ─────────────────────────────────────────────────────────

    public async Task<FileMetadata?> CreateFolderAsync(string name, string? parentId, CancellationToken ct = default)
    {
        SetAuthHeader();
        var body = new { name, parent_id = parentId };
        var resp = await _http.PostAsJsonAsync(_baseUrl + "folders", body, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<FileMetadata>(JsonOpts, ct);
    }

    // ── Favorite ──────────────────────────────────────────────────────────────

    public async Task ToggleFavoriteAsync(string fileId, CancellationToken ct = default)
    {
        SetAuthHeader();
        await _http.PostAsync($"{_baseUrl}files/{fileId}/favorite", null, ct);
    }

    public async Task DeleteItemAsync(string id, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.DeleteAsync($"{_baseUrl}files/{Uri.EscapeDataString(id)}", ct);
        resp.EnsureSuccessStatusCode();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public void UpdateBaseAddress(string url)
    {
        _baseUrl = NormalizeBaseUrl(url);
        _log.LogInformation("API Base URL updated to {Url}", _baseUrl);
    }

    public static string NormalizeBaseUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "http://localhost:8080/api/";
        
        url = url.TrimEnd('/');
        
        // If it doesn't end with /api or /api/v1, append /api
        if (!url.EndsWith("/api", StringComparison.OrdinalIgnoreCase) && 
            !url.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
        {
            url += "/api";
        }
            
        return url + "/";
    }

    private void SetAuthHeader()
    {
        if (!string.IsNullOrEmpty(_auth.Token))
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _auth.Token);
        else
            _http.DefaultRequestHeaders.Authorization = null;
    }
}
