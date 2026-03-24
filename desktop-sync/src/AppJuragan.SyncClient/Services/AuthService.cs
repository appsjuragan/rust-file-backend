using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace AppJuragan.SyncClient.Services;

/// <summary>
/// Stores the JWT token encrypted with DPAPI (Windows Data Protection API).
/// The token is only decryptable by the same Windows user on the same machine.
/// </summary>
public class AuthService
{
    private static readonly string TokenPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AppJuragan", "SyncClient", ".auth");

    private readonly ILogger<AuthService> _log;
    private string? _token;

    public AuthService(ILogger<AuthService> log)
    {
        _log = log;
        _token = LoadToken();
    }

    public bool IsAuthenticated => !string.IsNullOrEmpty(_token);

    public string? Token => _token;

    public void StoreToken(string jwt)
    {
        _token = jwt;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(TokenPath)!);
            var bytes = Encoding.UTF8.GetBytes(jwt);
            // Encrypt with DPAPI — current user scope
            var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(TokenPath, encrypted);
            _log.LogInformation("Auth token stored (encrypted)");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to persist auth token");
        }
    }

    public void ClearToken()
    {
        _token = null;
        if (File.Exists(TokenPath))
            File.Delete(TokenPath);
        _log.LogInformation("Auth token cleared");
    }

    private string? LoadToken()
    {
        try
        {
            if (!File.Exists(TokenPath)) return null;
            var encrypted = File.ReadAllBytes(TokenPath);
            var bytes = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Could not load stored auth token");
            return null;
        }
    }
}
