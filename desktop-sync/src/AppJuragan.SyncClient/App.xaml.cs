using AppJuragan.SyncClient.Services;
using AppJuragan.SyncClient.ViewModels;
using AppJuragan.SyncClient.Views;
using AppJuragan.ShellExtension;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using System.IO;
using System.Windows;

namespace AppJuragan.SyncClient;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // ── Serilog setup ────────────────────────────────────────────────────
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AppJuragan", "SyncClient", "Logs");
        Directory.CreateDirectory(logDir);

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(Path.Combine(logDir, "sync-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 7)
            .CreateLogger();

        // ── DI container ─────────────────────────────────────────────────────
        var sc = new ServiceCollection();
        ConfigureServices(sc);
        Services = sc.BuildServiceProvider();

        // ── Register COM shell extension ─────────────────────────────────────
        ShellOverlayRegistrar.Register();

        // ── Start system tray ────────────────────────────────────────────────
        var tray = Services.GetRequiredService<TrayIconService>();
        tray.Initialize();

        // ── Auto-start sync if already authenticated ─────────────────────────
        var auth = Services.GetRequiredService<AuthService>();
        if (auth.IsAuthenticated)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var api = Services.GetRequiredService<ApiClient>();
                    var settings = Services.GetRequiredService<SettingsService>();
                    var sync = Services.GetRequiredService<SyncEngine>();

                    // Ensure sync path is personalized: JuraganCloudSync\[username]
                    if (settings.Current.LocalSyncFolder.EndsWith("AppJuragan") || settings.Current.LocalSyncFolder.EndsWith("User"))
                    {
                        var profile = await api.GetProfileAsync();
                        if (profile != null)
                        {
                            var baseSyncDir = Path.Combine(
                                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                                "JuraganCloudSync");
                            var newPath = Path.Combine(baseSyncDir, profile.Username);

                            if (settings.Current.LocalSyncFolder != newPath)
                            {
                                settings.Current.LocalSyncFolder = newPath;
                                settings.Save(settings.Current);
                            }
                        }
                    }

                    await sync.StartAsync(CancellationToken.None);
                }
                catch (Exception ex)
                {
                    // If fail to fetch profile (offline), just start sync with whatever path we have
                    var sync = Services.GetRequiredService<SyncEngine>();
                    await sync.StartAsync(CancellationToken.None);
                }
            });
        }
        else
        {
            // Show sign-in window on first run
            var loginWin = Services.GetRequiredService<LoginWindow>();
            loginWin.Show();
        }
    }

    private static void ConfigureServices(IServiceCollection sc)
    {
        // Logging
        sc.AddLogging(lb =>
        {
            lb.ClearProviders();
            lb.AddSerilog(dispose: true);
        });

        // Settings (persisted JSON)
        sc.AddSingleton<SettingsService>();

        // Auth (JWT token store)
        sc.AddSingleton<AuthService>();

        // HTTP client for backend API
        sc.AddHttpClient<ApiClient>((sp, client) =>
        {
            var settings = sp.GetRequiredService<SettingsService>().Current;
            var url = settings.ServerUrl.TrimEnd('/') + "/";
            client.BaseAddress = new Uri(url);
            client.Timeout = TimeSpan.FromSeconds(60);
        });

        // Sync engine
        sc.AddSingleton<CloudFilterService>();
        sc.AddSingleton<SyncEngine>();
        sc.AddSingleton<SyncStateStore>();

        // Views / ViewModels
        sc.AddSingleton<TrayIconService>();
        sc.AddTransient<LoginWindow>();
        sc.AddTransient<LoginViewModel>();
        sc.AddTransient<SettingsWindow>();
        sc.AddTransient<SettingsViewModel>();
        sc.AddTransient<SyncStatusWindow>();
        sc.AddTransient<SyncStatusViewModel>();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Clean up COM shell extension (optional for graceful exit)
        Log.CloseAndFlush();
        base.OnExit(e);
    }
}
