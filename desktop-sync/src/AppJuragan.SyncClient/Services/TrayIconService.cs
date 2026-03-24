using AppJuragan.SyncClient.Views;
using Hardcodet.Wpf.TaskbarNotification;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Drawing;
using System.Windows;
using System.Windows.Controls;

namespace AppJuragan.SyncClient.Services;

public class TrayIconService : IDisposable
{
    private readonly IServiceProvider _sp;
    private readonly SyncEngine _sync;
    private readonly AuthService _auth;
    private readonly ILogger<TrayIconService> _log;
    private TaskbarIcon? _tray;

    public TrayIconService(IServiceProvider sp, SyncEngine sync,
        AuthService auth, ILogger<TrayIconService> log)
    {
        _sp = sp;
        _sync = sync;
        _auth = auth;
        _log = log;
    }

    public void Initialize()
    {
        _tray = new TaskbarIcon
        {
            ToolTipText = "AppJuragan Sync",
            Icon = LoadIcon("app"),
            ContextMenu = BuildContextMenu()
        };

        _tray.TrayMouseDoubleClick += (_, _) => ShowStatus();

        _sync.StatusChanged += (_, status) =>
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                _tray.Icon = LoadIcon(status switch
                {
                    SyncStatus.Syncing => "syncing",
                    SyncStatus.Error => "error",
                    SyncStatus.Paused => "paused",
                    _ => "app"
                });
                _tray.ToolTipText = $"AppJuragan Sync — {status}";
            });
        };

        _sync.FileActivity += (_, msg) =>
        {
            if (_sp.GetRequiredService<SettingsService>().Current.ShowNotifications)
                _tray.ShowBalloonTip("AppJuragan Sync", msg, BalloonIcon.Info);
        };
    }

    private ContextMenu BuildContextMenu()
    {
        var menu = new ContextMenu();

        var statusItem = new MenuItem { Header = "Sync Status...", FontWeight = FontWeights.Bold };
        statusItem.Click += (_, _) => ShowStatus();
        menu.Items.Add(statusItem);

        var syncNowItem = new MenuItem { Header = "Sync Now" };
        syncNowItem.Click += async (_, _) => await _sync.RunFullSyncAsync();
        menu.Items.Add(syncNowItem);

        menu.Items.Add(new Separator());

        var settingsItem = new MenuItem { Header = "Settings..." };
        settingsItem.Click += (_, _) => ShowSettings();
        menu.Items.Add(settingsItem);

        menu.Items.Add(new Separator());

        var signOutItem = new MenuItem { Header = "Sign Out" };
        signOutItem.Click += (_, _) =>
        {
            _auth.ClearToken();
            MessageBox.Show("Signed out. Restart to sign in again.", "AppJuragan Sync");
        };
        menu.Items.Add(signOutItem);

        var exitItem = new MenuItem { Header = "Exit" };
        exitItem.Click += async (_, _) =>
        {
            await _sync.StopAsync(CancellationToken.None);
            Application.Current.Shutdown();
        };
        menu.Items.Add(exitItem);

        return menu;
    }

    private void ShowStatus()
    {
        var win = _sp.GetRequiredService<SyncStatusWindow>();
        win.Show();
        win.Activate();
    }

    private void ShowSettings()
    {
        var win = _sp.GetRequiredService<SettingsWindow>();
        win.Show();
        win.Activate();
    }

    private static Icon LoadIcon(string name)
    {
        // Embedded resources under Resources/Icons/
        var asm = typeof(TrayIconService).Assembly;
        var resourceName = $"AppJuragan.SyncClient.Resources.Icons.{name}.ico";
        var stream = asm.GetManifestResourceStream(resourceName);
        if (stream != null) return new Icon(stream);

        // Fallback to a system icon if embedded icon is missing
        return SystemIcons.Application;
    }

    public void Dispose() => _tray?.Dispose();
}
