using AppJuragan.SyncClient.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using System.Diagnostics;
using System.IO;
using System.Windows.Media;

namespace AppJuragan.SyncClient.ViewModels;

public partial class LoginViewModel : ObservableObject
{
    private readonly ApiClient _api;
    private readonly AuthService _auth;
    private readonly SyncEngine _sync;
    private readonly SettingsService _settings;
    private readonly ILogger<LoginViewModel> _log;

    [ObservableProperty] private string _userCode = "";
    [ObservableProperty] private string _verificationUri = "";
    [ObservableProperty] private string _countdownText = "";
    [ObservableProperty] private Brush _countdownColor = Brushes.Gray;
    [ObservableProperty] private bool _otpVisible;
    [ObservableProperty] private bool _startVisible = true;
    [ObservableProperty] private bool _isPolling;
    [ObservableProperty] private bool _errorVisible;
    [ObservableProperty] private string _errorMessage = "";
    [ObservableProperty] private bool _successVisible;
    [ObservableProperty] private string _serverUrl;

    public event EventHandler? LoginSucceeded;
    private CancellationTokenSource? _pollCts;
    private DateTimeOffset _expiresAt;

    public LoginViewModel(ApiClient api, AuthService auth, SyncEngine sync,
        SettingsService settings, ILogger<LoginViewModel> log)
    {
        _api = api;
        _auth = auth;
        _sync = sync;
        _settings = settings;
        _log = log;
        _serverUrl = settings.Current.ServerUrl;
    }

    [RelayCommand]
    private async Task StartSignInAsync()
    {
        SetError("");
        
        // Update settings and API client base URL before starting
        var current = _settings.Current;
        current.ServerUrl = ServerUrl;
        _settings.Save(current);
        _api.UpdateBaseAddress(ServerUrl);

        StartVisible = false;

        try
        {
            var resp = await _api.InitiateDeviceAuthAsync();
            if (resp == null)
            {
                SetError("Could not contact server. Check your Server URL in Advanced settings.");
                StartVisible = true;
                return;
            }

            UserCode = resp.UserCode;
            
            // Calculate the frontend URL based on the server URL (strip /api/)
            var frontendUrl = ServerUrl.TrimEnd('/');
            if (frontendUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
                frontendUrl = frontendUrl[..^4];
            
            VerificationUri = $"{frontendUrl}/activate?user_code={resp.UserCode}";
            _expiresAt = DateTimeOffset.UtcNow.AddSeconds(resp.ExpiresIn);
            OtpVisible = true;
            IsPolling = true;

            // Open browser automatically
            try { Process.Start(new ProcessStartInfo(VerificationUri) { UseShellExecute = true }); }
            catch { /* ignore – user can navigate manually */ }

            // Start countdown timer
            StartCountdown();

            // Poll for token
            await PollForTokenAsync(resp.DeviceCode, resp.Interval);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Sign-in initiation failed");
            SetError($"Error: {ex.Message}");
            StartVisible = true;
        }
    }

    private void StartCountdown()
    {
        _pollCts ??= new CancellationTokenSource();
        var ct = _pollCts.Token;
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                var remaining = _expiresAt - DateTimeOffset.UtcNow;
                if (remaining <= TimeSpan.Zero) break;

                await System.Windows.Application.Current.Dispatcher.InvokeAsync(() =>
                {
                    CountdownText = $"Expires in {(int)remaining.TotalSeconds}s";
                    CountdownColor = remaining.TotalSeconds < 60
                        ? new SolidColorBrush(Color.FromRgb(0xFF, 0x6B, 0x6B))
                        : new SolidColorBrush(Color.FromRgb(0x8B, 0x8F, 0xA8));
                });
                await Task.Delay(1000, ct);
            }
        }, ct);
    }

    private async Task PollForTokenAsync(string deviceCode, int intervalSecs)
    {
        var ct = _pollCts!.Token;
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(intervalSecs), ct);

            try
            {
                var poll = await _api.PollDeviceTokenAsync(deviceCode, ct);
                if (poll == null) continue;

                switch (poll.Status)
                {
                    case "approved":
                        _auth.StoreToken(poll.Token!);
                        
                        // Set the local sync folder path to: C:\Users\[windows user]\JuraganCloudSync\[username]\
                        var currentSettings = _settings.Current;
                        var baseSyncDir = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), 
                            "JuraganCloudSync");
                        
                        currentSettings.LocalSyncFolder = Path.Combine(baseSyncDir, poll.Username ?? "User");
                        _settings.Save(currentSettings);

                        IsPolling = false;
                        SuccessVisible = true;
                        await _sync.StartAsync(CancellationToken.None);
                        LoginSucceeded?.Invoke(this, EventArgs.Empty);
                        return;

                    case "denied":
                        SetError("Access was denied. Click 'Sign in with OTP' to try again.");
                        Reset();
                        return;

                    case "expired":
                        SetError("OTP expired. Click 'Sign in with OTP' to try again.");
                        Reset();
                        return;

                    // "pending" — continue polling
                }
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Poll attempt failed, retrying...");
            }
        }
    }

    private void SetError(string msg)
    {
        ErrorMessage = msg;
        ErrorVisible = !string.IsNullOrEmpty(msg);
    }

    private void Reset()
    {
        _pollCts?.Cancel();
        _pollCts = null;
        IsPolling = false;
        OtpVisible = false;
        StartVisible = true;
        UserCode = "";
        VerificationUri = "";
        CountdownText = "";
    }
}
