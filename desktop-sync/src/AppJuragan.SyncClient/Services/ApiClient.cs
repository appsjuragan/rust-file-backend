using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace AppJuragan.SyncClient.Services;

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
    [property: JsonPropertyName("message")] string Message
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
    [JsonPropertyName("is_favorite")] public bool IsFavorite { get; set; }
    [JsonPropertyName("is_shared")] public bool IsShared { get; set; }
    [JsonPropertyName("hash")] public string? Hash { get; set; }
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

    public ApiClient(HttpClient http, AuthService auth, ILogger<ApiClient> log)
    {
        _http = http;
        _auth = auth;
        _log = log;
    }

    // ── Device auth flow ─────────────────────────────────────────────────────

    public async Task<DeviceCodeResponse?> InitiateDeviceAuthAsync(CancellationToken ct = default)
    {
        var resp = await _http.PostAsync("auth/device", null, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<DeviceCodeResponse>(JsonOpts, ct);
    }

    public async Task<PollTokenResponse?> PollDeviceTokenAsync(string deviceCode, CancellationToken ct = default)
    {
        var resp = await _http.GetAsync($"auth/device/token?device_code={Uri.EscapeDataString(deviceCode)}", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<PollTokenResponse>(JsonOpts, ct);
    }

    // ── File list ─────────────────────────────────────────────────────────────

    public async Task<List<FileMetadata>> ListFilesAsync(string? parentId = null, CancellationToken ct = default)
    {
        SetAuthHeader();
        var url = parentId == null ? "files?parent_id=root" : $"files?parent_id={Uri.EscapeDataString(parentId)}";
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
            all.AddRange(items);
            foreach (var item in items.Where(i => i.IsFolder))
                queue.Enqueue(item.Id);
        }
        return all;
    }

    // ── Upload ────────────────────────────────────────────────────────────────

    public async Task<UploadInitResponse?> InitUploadAsync(UploadInitRequest req, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.PostAsJsonAsync("files/upload/init", req, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<UploadInitResponse>(JsonOpts, ct);
    }

    public async Task<string> UploadChunkAsync(string uploadId, int partNumber, byte[] data, CancellationToken ct = default)
    {
        SetAuthHeader();
        var content = new ByteArrayContent(data);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        var resp = await _http.PutAsync($"files/upload/{uploadId}/chunk/{partNumber}", content, ct);
        resp.EnsureSuccessStatusCode();
        // ETag is in response header
        return resp.Headers.ETag?.Tag?.Trim('"') ?? partNumber.ToString();
    }

    public async Task<FileMetadata?> CompleteUploadAsync(string uploadId, CompleteUploadRequest req, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.PostAsJsonAsync($"files/upload/{uploadId}/complete", req, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<FileMetadata>(JsonOpts, ct);
    }

    // ── Download ──────────────────────────────────────────────────────────────

    public async Task DownloadFileAsync(string fileId, string localPath, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.GetAsync($"files/{fileId}", HttpCompletionOption.ResponseHeadersRead, ct);
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
        var resp = await _http.PostAsJsonAsync("folders", body, JsonOpts, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<FileMetadata>(JsonOpts, ct);
    }

    // ── Favorite ──────────────────────────────────────────────────────────────

    public async Task ToggleFavoriteAsync(string fileId, CancellationToken ct = default)
    {
        SetAuthHeader();
        await _http.PostAsync($"files/{fileId}/favorite", null, ct);
    }

    public async Task DeleteItemAsync(string id, CancellationToken ct = default)
    {
        SetAuthHeader();
        var resp = await _http.DeleteAsync($"files/{Uri.EscapeDataString(id)}", ct);
        resp.EnsureSuccessStatusCode();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void SetAuthHeader()
    {
        if (!string.IsNullOrEmpty(_auth.Token))
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _auth.Token);
    }
}
